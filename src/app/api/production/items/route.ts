import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTION_STATUSES, jobToOrderStatus, rollupStatus } from "@/lib/production";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

// Move uma peça entre Fila/Imprimindo/Acabamento/Concluído. O pedido
// (ProductionJob) e o status em Vendas são recalculados a partir de todas as
// peças da mesma vez — só ficam "prontos" quando a última chegar lá.
export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = z.object({ status: z.enum(PRODUCTION_STATUSES) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.productionItem.findUnique({
    where: { id },
    include: {
      product: { include: { materials: true } },
      job: { include: { items: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Peça não encontrada" }, { status: 404 });

  // Regra da bancada: uma impressora só imprime uma peça de cada vez. Sem
  // impressora atribuída ao pedido não dá pra checar isso, então exige a
  // escolha antes; com impressora, barra se ela já estiver com outra peça
  // (de qualquer pedido) em Imprimindo.
  if (parsed.data.status === "PRINTING") {
    const printerName = existing.job.printerName.trim();
    if (!printerName) {
      return NextResponse.json({ error: "Atribua uma impressora a este pedido antes de mover a peça para Imprimindo." }, { status: 400 });
    }
    const conflict = await prisma.productionItem.findFirst({
      where: { status: "PRINTING", id: { not: id }, job: { printerName } },
      include: { job: { include: { order: { select: { orderNumber: true } } } } },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `A impressora "${printerName}" já está imprimindo "${conflict.name}" (pedido ${conflict.job.order.orderNumber}). Só dá pra imprimir uma peça por vez.` },
        { status: 409 },
      );
    }
  }

  // Só baixa estoque na primeira vez que a peça é concluída — usar
  // `completedAt` (não o status desta requisição) evita baixar duas vezes se
  // alguém voltar a peça pra fila e completar de novo depois.
  const firstTimeCompleted = parsed.data.status === "COMPLETED" && !existing.completedAt;

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionItem.update({
      where: { id },
      data: {
        status: parsed.data.status,
        completedAt: parsed.data.status === "COMPLETED" ? (existing.completedAt ?? new Date()) : existing.completedAt,
      },
    });

    if (firstTimeCompleted && existing.product) {
      for (const line of existing.product.materials) {
        await tx.material.update({
          where: { id: line.materialId },
          data: { stockGrams: { decrement: line.grams * existing.quantity } },
        });
      }
    }

    const siblingStatuses = existing.job.items.map((sibling) => (sibling.id === id ? parsed.data.status : sibling.status));
    const rollup = rollupStatus(siblingStatuses);

    await tx.productionJob.update({
      where: { id: existing.jobId },
      data: {
        status: rollup,
        completedAt: rollup === "COMPLETED" ? (existing.job.completedAt ?? new Date()) : existing.job.completedAt,
      },
    });
    // Produção voltou de "concluído" (peça refeita) → a entrega registrada deixa de valer.
    const orderStatus = jobToOrderStatus[rollup];
    await tx.salesOrder.update({ where: { id: existing.job.orderId }, data: { status: orderStatus, ...(orderStatus !== "COMPLETED" ? { deliveredAt: null } : {}) } });

    return updated;
  });

  return NextResponse.json(item);
}
