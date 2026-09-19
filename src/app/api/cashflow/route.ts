import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeCash } from "@/lib/metrics";

const entrySchema = z.object({
  date: z.coerce.date(),
  category: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  description: z.string().optional(),
  status: z.enum(["REALIZED", "PLANNED"]).optional(),
  amount: z.number().min(0.01),
});

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [entries, openOrders] = await Promise.all([
    prisma.cashEntry.findMany({ orderBy: { date: "desc" }, take: 300 }),
    prisma.salesOrder.findMany({ where: { paymentStatus: { not: "PAID" } }, select: { totalAmount: true, paidAmount: true } }),
  ]);

  // Preço Sugerido/Custo são do pedido (recebimento), não do lançamento em
  // si — orderId não é uma relação do Prisma aqui (é só um id solto), então
  // busca os pedidos referenciados à parte e junta na mão.
  const orderIds = Array.from(new Set(entries.filter((entry) => entry.orderId).map((entry) => entry.orderId as string)));
  const orders = orderIds.length
    ? await prisma.salesOrder.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, quantity: true, unitCostSnapshot: true, product: { select: { price: true } } },
      })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const enriched = entries.map((entry) => {
    const order = entry.orderId ? orderById.get(entry.orderId) : undefined;
    return {
      ...entry,
      suggestedPrice: order?.product ? order.product.price * order.quantity : null,
      cost: order ? order.unitCostSnapshot * order.quantity : null,
    };
  });

  return NextResponse.json({ entries: enriched, summary: summarizeCash(entries, openOrders) });
}

// Lançamento manual — entradas automáticas (recebimento, custo fixo/variável)
// vêm de /api/payments e /api/costs/*.
export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = entrySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const entry = await prisma.cashEntry.create({
    data: { date: data.date, category: data.category, type: data.type, description: data.description ?? "", status: data.status ?? "REALIZED", amount: data.amount },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const entry = await prisma.cashEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (entry.sourceType) {
    return NextResponse.json({ error: "Este lançamento vem de outra tela — edite ou apague na origem (recebimento ou custo)." }, { status: 400 });
  }
  await prisma.cashEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
