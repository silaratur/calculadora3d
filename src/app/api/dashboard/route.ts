import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCashSummary } from "@/lib/metrics";
import { dayOf, dayRange, isRealized, kindOf, monthLabel, monthOf, monthRange } from "@/lib/finance";
import { evaluatePrice, type CompetitorEntry } from "@/lib/competitors";

const priorityRank: Record<string, number> = { URGENT: 2, HIGH: 1 };

async function authenticated() {
  return Boolean(await getCurrentUser());
}

/**
 * Período dos números de vendas do Hoje: por padrão o dia de hoje (foto do dia,
 * no fuso de Brasília — regra do usuário em 10/10/2026: antes somava tudo desde
 * o início); com ?mes=AAAA-MM, o mês escolhido (nunca depois do mês atual).
 */
function salesPeriod(request: Request, now: Date) {
  const month = new URL(request.url).searchParams.get("mes");
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= monthOf(now)) {
    return { kind: "month" as const, key: month, label: monthLabel(month), current: month === monthOf(now), ...monthRange(month) };
  }
  const day = dayOf(now);
  return { kind: "day" as const, key: day, label: "Hoje", current: true, ...dayRange(day) };
}

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const now = new Date();
  const period = salesPeriod(request, now);
  const [orders, ordersEver, firstOrder, periodEntries, closingEntries, cash, openJobs, activeProducts, materials, toPrint, openOrders, openQuotes] = await Promise.all([
    prisma.salesOrder.findMany({ where: { createdAt: { gte: period.start, lt: period.end } }, select: { totalAmount: true, paidAmount: true, unitCostSnapshot: true, quantity: true } }),
    prisma.salesOrder.count(),
    // Primeiro mês com venda: limite da navegação para trás.
    prisma.salesOrder.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Recebido no período = pagamentos que entraram no caixa (menos estornos).
    prisma.cashEntry.findMany({ where: { date: { gte: period.start, lt: period.end } }, select: { type: true, status: true, amount: true, date: true, sourceType: true, category: true } }),
    // Saldo no fim de um mês que já passou (no mês atual e no dia vale o saldo de agora).
    period.current ? Promise.resolve(null) : prisma.cashEntry.findMany({ where: { date: { lt: period.end } }, select: { type: true, status: true, amount: true, date: true, sourceType: true } }),
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
  const competitors = await competitorAlerts();
  // Pedidos da loja ainda em aberto: o cliente pode não ter mandado o WhatsApp,
  // então o Hoje avisa para ninguém ficar sem resposta.
  const storeOrders = await prisma.quote.findMany({
    where: { source: { in: ["loja", "loja-encomenda"] }, status: "DRAFT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, customerName: true, customerPhone: true, productName: true, finalPrice: true, source: true, createdAt: true },
  });
  const nowMs = Date.now();

  const totalSold = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalCost = orders.reduce((sum, order) => sum + order.unitCostSnapshot * order.quantity, 0);
  const grossProfit = totalSold - totalCost;
  const pendingMinutes = openJobs.reduce((sum, job) => sum + job.plannedMinutes, 0);
  const lowStockMaterials = materials.filter((item) => item.stockGrams <= item.lowStockThresholdGrams).length;
  const realizedInPeriod = periodEntries.filter((entry) => isRealized(entry, now));
  const received = realizedInPeriod.reduce((sum, entry) => sum + (kindOf(entry) === "receipt" ? entry.amount : kindOf(entry) === "reversal" ? -entry.amount : 0), 0);
  const closingBalance = closingEntries
    ? closingEntries.filter((entry) => isRealized(entry, now)).reduce((sum, entry) => sum + (entry.type === "IN" ? entry.amount : -entry.amount), 0)
    : null;

  return NextResponse.json({
    period: {
      kind: period.kind,
      key: period.key,
      label: period.label,
      current: period.current,
      firstMonth: firstOrder ? monthOf(firstOrder.createdAt) : monthOf(now),
      currentMonth: monthOf(now),
      received,
      // Do que foi vendido no período, quanto ainda falta receber.
      openFromPeriod: orders.reduce((sum, order) => sum + Math.max(order.totalAmount - order.paidAmount, 0), 0),
      closingBalance,
    },
    ordersEver,
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
    competitors,
    storeOrders: storeOrders.map((order) => ({ ...order, waitingHours: Math.floor((nowMs - order.createdAt.getTime()) / 3_600_000) })),
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

const toEntry = (item: { id: string; productId: string | null; competitor: string; channel: string; price: number; quantity: number; shipping: number; checkedAt: Date }): CompetitorEntry =>
  ({ ...item, checkedAt: item.checkedAt.toISOString() });

/**
 * Seção "Concorrentes mudaram de preço" do Hoje: mudanças da última verificação
 * (terças e sextas, por 7 dias), com a recomendação de preço antes x depois, e
 * os produtos ativos ainda sem pesquisa de concorrente.
 */
async function competitorAlerts() {
  const [lastRun, products] = await Promise.all([
    prisma.competitorCheckRun.findFirst({
      orderBy: { createdAt: "desc" },
      include: { changes: { include: { competitorPrice: { select: { productId: true, competitor: true, url: true, quantity: true, shipping: true } } } } },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, price: true, cost: true, competitors: { select: { id: true, productId: true, competitor: true, channel: true, price: true, quantity: true, shipping: true, checkedAt: true, lastCheckStatus: true } } },
    }),
  ]);

  const missing = products.filter((product) => !product.competitors.length).map((product) => ({ sku: product.sku, name: product.name }));
  const recent = lastRun && Date.now() - lastRun.createdAt.getTime() < 7 * 86400000 ? lastRun : null;
  const byProduct = new Map<string, NonNullable<typeof recent>["changes"]>();
  for (const change of recent?.changes ?? []) {
    const productId = change.competitorPrice.productId;
    if (!productId) continue;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), change]);
  }

  const changes = products.filter((product) => byProduct.has(product.id)).map((product) => {
    const productChanges = byProduct.get(product.id)!;
    // Antes: preços antigos dos alterados e todos os que estavam no ar; depois: só os que seguem no ar, com o preço novo.
    const oldPrices = new Map(productChanges.map((change) => [change.competitorPriceId, change.oldPrice]));
    const before = product.competitors.map((item) => toEntry({ ...item, price: oldPrices.get(item.id) ?? item.price }));
    const after = product.competitors.filter((item) => item.lastCheckStatus !== "INDISPONIVEL").map(toEntry);
    const evalBefore = evaluatePrice(product, before);
    const evalAfter = evaluatePrice(product, after);
    return {
      sku: product.sku,
      name: product.name,
      price: product.price,
      medianBefore: evalBefore?.median ?? null,
      medianAfter: evalAfter?.median ?? null,
      recommendation: evalAfter?.recommendation ?? "Todos os anúncios acompanhados saíram do ar — pesquise concorrentes novos.",
      suggestedPrice: evalAfter?.suggestedPrice ?? null,
      items: productChanges.map((change) => ({
        competitor: change.competitorPrice.competitor,
        url: change.competitorPrice.url,
        status: change.status,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
      })),
    };
  });

  return {
    lastRun: lastRun ? { createdAt: lastRun.createdAt, checked: lastRun.checked, changed: lastRun.changed, unavailable: lastRun.unavailable, errors: lastRun.errors } : null,
    changes,
    missing,
  };
}
