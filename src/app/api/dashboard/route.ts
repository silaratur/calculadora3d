import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCashSummary } from "@/lib/metrics";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [orders, cash, openJobs, activeProducts, materials] = await Promise.all([
    prisma.salesOrder.findMany({ select: { totalAmount: true, unitCostSnapshot: true, quantity: true } }),
    getCashSummary(),
    prisma.productionJob.findMany({ where: { status: { not: "COMPLETED" } }, select: { plannedMinutes: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.material.findMany({ where: { active: true }, select: { stockGrams: true, lowStockThresholdGrams: true } }),
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
  });
}
