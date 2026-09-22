import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(
    await prisma.productionJob.findMany({
      // quote: id+code linkam direto pro orçamento de origem. Os itens de
      // verdade a imprimir vêm de `items` (ProductionItem), não mais de um
      // snapshot reprocessado na tela.
      include: {
        order: { include: { customer: true, quote: { select: { id: true, code: true } } } },
        // material/imageUrl/printTimeHours vêm do Catálogo — ajudam a priorizar
        // a fila (o que rende mais rápido, qual filamento carregar na impressora).
        items: { orderBy: { createdAt: "asc" }, include: { product: { select: { imageUrl: true, material: true, printTimeHours: true } } } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  );
}

// Campos do pedido como um todo (impressora, prioridade, observações,
// tempo planejado). O status de cada peça é tratado à parte, em
// /api/production/items — o status daqui é só o rollup, recalculado lá.
export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = z
    .object({ priority: z.string().optional(), printerName: z.string().optional(), plannedMinutes: z.number().min(0).optional(), notes: z.string().optional() })
    .safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.productionJob.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  const job = await prisma.productionJob.update({ where: { id }, data: parsed.data });
  return NextResponse.json(job);
}
