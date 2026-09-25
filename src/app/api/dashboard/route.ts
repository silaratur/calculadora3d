import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCashSummary } from "@/lib/metrics";

const priorityRank: Record<string, number> = { URGENT: 2, HIGH: 1 };

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [orders, cash, openJobs, activeProducts, materials, toPrint, openOrders, openQuotes] = await Promise.all([
    prisma.salesOrder.findMany({ select: { totalAmount: true, unitCostSnapshot: true, quantity: true } }),
    getCashSummary(),
    prisma.productionJob.findMany({ where: { status: { not: "COMPLETED" } }, select: { plannedMinutes: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.material.findMany({ where: { active: true }, select: { stockGrams: true, lowStockThresholdGrams: true } }),
    // Listas da tela Hoje: o que imprimir (peças na fila ou na impressora) e
    // os pedidos em aberto, de onde saem os prazos e o que falta receber.
    prisma.productionItem.findMany({
      where: { status: { in: ["WAITING", "PRINTING"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, quantity: true, status: true,
        product: { select: { printTimeHours: true } },
        job: { select: { priority: true, order: { select: { orderNumber: true, customer: { select: { name: true } } } } } },
      },
    }),
    prisma.salesOrder.findMany({
      where: { OR: [{ status: { not: "COMPLETED" } }, { paymentStatus: { not: "PAID" } }, { deliveredAt: null }] },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, orderNumber: true, productName: true, status: true, paymentStatus: true,
        totalAmount: true, paidAmount: true, dueDate: true, deliveredAt: true, updatedAt: true, customer: { select: { name: true } },
      },
    }),
    // Orçamentos em aberto = receita potencial (nunca entra no Caixa nem no "A receber").
    prisma.quote.aggregate({ where: { status: "DRAFT" }, _count: true, _sum: { finalPrice: true } }),
  ]);

  const totalSold = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalCost = orders.reduce((sum, order) => sum + order.unitCostSnapshot * order.quantity, 0);
  const grossProfit = totalSold - totalCost;
  const pendingMinutes = openJobs.reduce((sum, job) => sum + job.plannedMinutes, 0);
  const lowStockMaterials = materials.filter((item) => item.stockGrams <= item.lowStockThresholdGrams).length;

  return NextResponse.json({
    totalSold,
    totalCost,
    grossProfit,
    marginPercent: totalSold ? (grossProfit / totalSold) * 100 : 0,
    ticketMedio: orders.length ? totalSold / orders.length : 0,
    ordersCount: orders.length,
    openProductionJobs: openJobs.length,
    pendingProductionHours: pendingMinutes / 60,
    activeProducts,
    lowStockMaterials,
    cash,
    openQuotes: { count: openQuotes._count, total: openQuotes._sum.finalPrice ?? 0 },
    today: {
      // Urgente/alta primeiro; depois quem já está imprimindo; depois ordem de chegada.
      toPrint: toPrint
        .map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          status: item.status,
          minutes: Math.round((item.product?.printTimeHours ?? 0) * item.quantity * 60),
          priority: item.job.priority,
          orderNumber: item.job.order.orderNumber,
          customer: item.job.order.customer?.name ?? null,
        }))
        .sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) || Number(b.status === "PRINTING") - Number(a.status === "PRINTING")),
      // Pedidos ainda em produção com data de entrega, do prazo mais próximo (ou vencido) pro mais distante.
      deadlines: openOrders
        .filter((order) => order.status !== "COMPLETED" && order.dueDate)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
        .map((order) => ({ id: order.id, orderNumber: order.orderNumber, productName: order.productName, customer: order.customer?.name ?? null, dueDate: order.dueDate })),
      // Produção concluída e ainda não entregue ao cliente.
      toDeliver: openOrders
        .filter((order) => order.status === "COMPLETED" && !order.deliveredAt)
        .map((order) => ({ id: order.id, orderNumber: order.orderNumber, productName: order.productName, customer: order.customer?.name ?? null, dueDate: order.dueDate, readySince: order.updatedAt })),
      // Mesmo critério do "A receber" (getCashSummary): tudo que não está PAID, pelo que falta.
      toCollect: openOrders
        .filter((order) => order.paymentStatus !== "PAID" && order.totalAmount - order.paidAmount > 0)
        .map((order) => ({ id: order.id, orderNumber: order.orderNumber, productName: order.productName, customer: order.customer?.name ?? null, remaining: order.totalAmount - order.paidAmount }))
        .sort((a, b) => b.remaining - a.remaining),
    },
  });
}
