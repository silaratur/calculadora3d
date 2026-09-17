import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

/** AAAAMMDD-0001, sequencial por dia, no fuso local. */
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function nextOrderNumber() {
  const prefix = `PED-${localDateKey(new Date())}`;
  const last = await prisma.salesOrder.findFirst({
    where: { orderNumber: { startsWith: `${prefix}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastSeq = last ? Number(last.orderNumber.split("-").pop()) || 0 : 0;
  return `${prefix}-${String(lastSeq + 1).padStart(4, "0")}`;
}

// Um orçamento salvo pela calculadora vira um pedido real: o preço final e o
// custo base já foram calculados lá, então isto só transcreve os números —
// não recalcula nada. `Quote.order`/`SalesOrder.quoteId` existiam desde o
// primeiro schema e nunca tinham sido usados.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;

  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (quote.status === "CONVERTED") return NextResponse.json({ error: "Este orçamento já foi convertido em venda" }, { status: 409 });

  let plannedMinutes = 0;
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as { calculations?: { printTime?: number } };
    plannedMinutes = Math.round((Number(snapshot.calculations?.printTime) || 0) * 60);
  } catch {
    plannedMinutes = 0;
  }

  const [order] = await prisma.$transaction([
    prisma.salesOrder.create({
      data: {
        orderNumber: await nextOrderNumber(),
        quoteId: quote.id,
        productId: quote.productId,
        productName: quote.productName,
        quantity: 1,
        unitPrice: quote.finalPrice,
        unitCostSnapshot: quote.baseCost,
        totalAmount: quote.finalPrice,
        notes: quote.customerName ? `Cliente do orçamento: ${quote.customerName}` : "",
        production: { create: { plannedMinutes } },
      },
      include: { production: true, customer: true, product: true, marketplace: true },
    }),
    prisma.quote.update({ where: { id }, data: { status: "CONVERTED" } }),
  ]);

  return NextResponse.json({ order });
}
