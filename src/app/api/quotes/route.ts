import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextSharedCode } from "@/lib/codes";

export const quoteSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(2),
  // Orçamentos (a tela atual) já exige nome/telefone/e-mail no formulário —
  // aqui fica permissivo pro /calculator legado (mantido fora do menu, ver
  // memória do projeto) continuar salvando como sempre salvou.
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email("E-mail do cliente inválido").or(z.literal("")).optional(),
  status: z.string().default("DRAFT"),
  baseCost: z.number().min(0),
  finalPrice: z.number().min(0),
  margin: z.number(),
  snapshot: z.record(z.string(), z.unknown()),
  notes: z.string().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  // Por padrão só orçamentos válidos (não arquivados); ?status=ARCHIVED
  // traz só os reprovados (aba "Reprovados" em Orçamentos).
  const archived = new URL(request.url).searchParams.get("status") === "ARCHIVED";
  return NextResponse.json(
    await prisma.quote.findMany({
      where: archived ? { status: "ARCHIVED" } : { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 500,
      // venda que nasceu do orçamento aprovado — pro link "ver venda" no card
      include: { order: { select: { id: true, orderNumber: true } } },
    }),
  );
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const validUntil = new Date(Date.now() + settings.quoteValidityDays * 24 * 60 * 60 * 1000);
  const data = { productId: parsed.data.productId ?? null, productName: parsed.data.productName, customerName: parsed.data.customerName ?? "", customerPhone: parsed.data.customerPhone ?? "", customerEmail: parsed.data.customerEmail ?? "", status: parsed.data.status, baseCost: parsed.data.baseCost, finalPrice: parsed.data.finalPrice, margin: parsed.data.margin, snapshotJson: JSON.stringify(parsed.data.snapshot), notes: parsed.data.notes ?? "", validUntil };

  // Código sequencial por dia: em uso concorrente duas requisições podem ler o
  // mesmo "último código" antes de gravar — a constraint @unique pega isso, e
  // aqui tentamos de novo com o próximo (mesmo padrão de /api/orders).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const quote = await prisma.quote.create({ data: { ...data, code: await nextSharedCode() } });
      return NextResponse.json(quote, { status: 201 });
    } catch (error) {
      const isUniqueClash = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueClash || attempt === 2) throw error;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o código do orçamento" }, { status: 500 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const existing = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (existing.status === "CONVERTED") return NextResponse.json({ error: "Orçamento aprovado já virou venda — não pode ser reprovado." }, { status: 409 });
  await prisma.quote.update({ where: { id }, data: { status: "ARCHIVED", archiveReason: reason } });
  return NextResponse.json({ success: true });
}
