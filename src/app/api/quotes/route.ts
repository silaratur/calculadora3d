import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quoteSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(2),
  customerName: z.string().optional(),
  status: z.string().default("DRAFT"),
  baseCost: z.number().min(0),
  finalPrice: z.number().min(0),
  margin: z.number(),
  snapshot: z.record(z.string(), z.unknown()),
  notes: z.string().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

/** AAAAMMDD no fuso local — perto da meia-noite no Brasil toISOString() já mostraria o dia seguinte. */
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** ORC-AAAAMMDD-0001, sequencial por dia — mesmo esquema do PED-... em /api/orders. */
async function nextQuoteCode() {
  const prefix = `ORC-${localDateKey(new Date())}`;
  const last = await prisma.quote.findFirst({
    where: { code: { startsWith: `${prefix}-` } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastSeq = last?.code ? Number(last.code.split("-").pop()) || 0 : 0;
  return `${prefix}-${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.quote.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const validUntil = new Date(Date.now() + settings.quoteValidityDays * 24 * 60 * 60 * 1000);
  const data = { productId: parsed.data.productId ?? null, productName: parsed.data.productName, customerName: parsed.data.customerName ?? "", status: parsed.data.status, baseCost: parsed.data.baseCost, finalPrice: parsed.data.finalPrice, margin: parsed.data.margin, snapshotJson: JSON.stringify(parsed.data.snapshot), notes: parsed.data.notes ?? "", validUntil };

  // Código sequencial por dia: em uso concorrente duas requisições podem ler o
  // mesmo "último código" antes de gravar — a constraint @unique pega isso, e
  // aqui tentamos de novo com o próximo (mesmo padrão de /api/orders).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const quote = await prisma.quote.create({ data: { ...data, code: await nextQuoteCode() } });
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
  await prisma.quote.update({ where: { id }, data: { status: "ARCHIVED" } });
  return NextResponse.json({ success: true });
}
