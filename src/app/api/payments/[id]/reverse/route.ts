import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

// Estorno: não apaga o recebimento nem a entrada original no fluxo de caixa
// (preserva o histórico) — abate o valor do pedido, recalcula o status de
// pagamento, marca o recebimento como estornado e lança uma saída
// correspondente no caixa, pra "o dinheiro voltou" aparecer de verdade.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return NextResponse.json({ error: "Recebimento não encontrado" }, { status: 404 });
  if (payment.reversedAt) return NextResponse.json({ error: "Este recebimento já foi estornado" }, { status: 400 });

  const order = await prisma.salesOrder.findUnique({ where: { id: payment.orderId } });
  if (!order) return NextResponse.json({ error: "Pedido do recebimento não encontrado" }, { status: 404 });

  const newPaidAmount = Math.max(0, order.paidAmount - payment.amount);
  const newStatus = newPaidAmount <= 0.01 ? "PENDING" : newPaidAmount >= order.totalAmount - 0.01 ? "PAID" : "PARTIAL";
  const date = new Date();

  const [, updatedOrder, cashEntry] = await prisma.$transaction([
    prisma.payment.update({ where: { id }, data: { reversedAt: date } }),
    prisma.salesOrder.update({ where: { id: order.id }, data: { paidAmount: newPaidAmount, paymentStatus: newStatus } }),
    prisma.cashEntry.create({
      data: {
        date,
        category: "Estorno",
        type: "OUT",
        description: `Estorno do recebimento ${order.orderNumber} — ${order.productName}`,
        status: "REALIZED",
        amount: payment.amount,
        orderId: order.id,
        sourceType: "PAYMENT_REVERSAL",
        sourceId: payment.id,
      },
    }),
  ]);

  return NextResponse.json({ order: updatedOrder, cashEntry });
}
