import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

// O board de produção usa WAITING/PRINTING/FINISHING/COMPLETED, mas Vendas
// filtra pedidos por PENDING/IN_PROGRESS/COMPLETED (SalesOrder.status) — os
// dois nunca estavam ligados, então o filtro de Vendas nunca saía de "Falta
// produzir". Todo avanço no board agora também atualiza o pedido.
const jobToOrderStatus: Record<string, string> = {
  WAITING: "PENDING",
  PRINTING: "IN_PROGRESS",
  FINISHING: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(
    await prisma.productionJob.findMany({
      // quote: id+code linkam direto pro orçamento de origem; snapshotJson
      // traz a lista real de produtos pra mostrar "quais itens imprimir" no
      // card (nem todo pedido vem de um orçamento convertido, daí opcional).
      include: { order: { include: { customer: true, quote: { select: { id: true, code: true, snapshotJson: true } } } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  );
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = z
    .object({ status: z.string().optional(), priority: z.string().optional(), printerName: z.string().optional(), plannedMinutes: z.number().min(0).optional(), notes: z.string().optional() })
    .safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.productionJob.findUnique({
    where: { id },
    include: { order: { include: { product: { include: { materials: true } } } } },
  });
  if (!existing) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  // Só baixa estoque na primeira vez que o job é concluído — usar `completedAt`
  // (não o status desta requisição) evita baixar duas vezes se alguém voltar
  // o job pra fila e completar de novo depois.
  const firstTimeCompleted = parsed.data.status === "COMPLETED" && !existing.completedAt;
  const data = { ...parsed.data, completedAt: parsed.data.status === "COMPLETED" ? new Date() : undefined };

  const job = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionJob.update({ where: { id }, data });

    const orderStatus = parsed.data.status ? jobToOrderStatus[parsed.data.status] : undefined;
    if (orderStatus) {
      await tx.salesOrder.update({ where: { id: existing.orderId }, data: { status: orderStatus } });
    }

    if (firstTimeCompleted && existing.order.product) {
      for (const line of existing.order.product.materials) {
        await tx.material.update({
          where: { id: line.materialId },
          data: { stockGrams: { decrement: line.grams * existing.order.quantity } },
        });
      }
    }

    return updated;
  });

  return NextResponse.json(job);
}
