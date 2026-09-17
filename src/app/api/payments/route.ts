import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const paymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().min(0.01),
  method: z.string().optional(),
  notes: z.string().optional(),
  date: z.coerce.date().optional(),
});

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const orderId = new URL(request.url).searchParams.get("orderId");
  return NextResponse.json(
    await prisma.payment.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { date: "desc" },
      take: 200,
    }),
  );
}

// Registra um recebimento contra um pedido: soma em SalesOrder.paidAmount (não
// recalcula pela soma dos pagamentos, então pedidos antigos sem pagamentos
// registrados continuam corretos), recalcula paymentStatus e gera a entrada
// correspondente no fluxo de caixa.
export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = paymentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const order = await prisma.salesOrder.findUnique({ where: { id: data.orderId } });
  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const remaining = order.totalAmount - order.paidAmount;
  if (data.amount > remaining + 0.01) {
    return NextResponse.json({ error: `Valor maior que o pendente (${remaining.toFixed(2)}).` }, { status: 400 });
  }

  const date = data.date ?? new Date();
  const [payment, updatedOrder] = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: { orderId: data.orderId, amount: data.amount, method: data.method ?? "PIX", notes: data.notes ?? "", date },
    });
    const newPaidAmount = order.paidAmount + data.amount;
    const updated = await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: newPaidAmount >= order.totalAmount - 0.01 ? "PAID" : "PARTIAL",
      },
    });
    await tx.cashEntry.create({
      data: {
        date,
        category: "Venda",
        type: "IN",
        description: `Recebimento ${order.orderNumber} — ${order.productName}`,
        status: "REALIZED",
        amount: data.amount,
        orderId: order.id,
        sourceType: "PAYMENT",
        sourceId: created.id,
      },
    });
    return [created, updated];
  });

  return NextResponse.json({ payment, order: updatedOrder }, { status: 201 });
}
