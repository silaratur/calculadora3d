import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quoteSchema } from "../route";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  return NextResponse.json(quote);
}

/**
 * Atualiza um orçamento já existente (ex: reabriu via "Carregar no Editor" e
 * salvou de novo) — sem isso, cada "Salvar" criava uma linha nova em vez de
 * atualizar a mesma, duplicando registros em Projetos. Mantém o code e o
 * validUntil originais: é o mesmo orçamento, não um reemitido.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const quote = await prisma.quote.update({
    where: { id },
    data: {
      productId: parsed.data.productId ?? null,
      productName: parsed.data.productName,
      customerName: parsed.data.customerName ?? "",
      status: parsed.data.status,
      baseCost: parsed.data.baseCost,
      finalPrice: parsed.data.finalPrice,
      margin: parsed.data.margin,
      snapshotJson: JSON.stringify(parsed.data.snapshot),
      notes: parsed.data.notes ?? "",
    },
  });
  return NextResponse.json(quote);
}
