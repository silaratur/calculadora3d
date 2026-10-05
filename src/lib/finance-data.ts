import { prisma } from "@/lib/prisma";
import { monthOf, parsePartners, partnerAccounts, summarizeMonth } from "@/lib/finance";

/** Carrega tudo do Fechamento: meses (do primeiro lançamento até o mês atual), contas dos sócios e fechamentos. */
export async function loadFinance(selectedMonth?: string, now = new Date()) {
  const [entries, payments, orders, settings, closings] = await Promise.all([
    prisma.cashEntry.findMany({ select: { date: true, type: true, status: true, category: true, amount: true, sourceType: true, partner: true, description: true } }),
    prisma.payment.findMany({ select: { date: true, amount: true, reversedAt: true, order: { select: { totalAmount: true, quantity: true, unitCostSnapshot: true } } } }),
    prisma.salesOrder.findMany({ select: { createdAt: true, totalAmount: true, paidAmount: true } }),
    prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} }),
    prisma.monthClosing.findMany({ orderBy: { month: "asc" } }),
  ]);
  const partners = parsePartners(settings.partnersJson);
  const current = monthOf(now);
  const firstDates = [...entries.map((entry) => entry.date), ...orders.map((order) => order.createdAt)].filter((date) => date.getTime() <= now.getTime());
  const first = firstDates.length ? monthOf(new Date(Math.min(...firstDates.map((date) => date.getTime())))) : current;
  const monthKeys: string[] = [];
  for (let [year, mon] = first.split("-").map(Number); `${year}-${String(mon).padStart(2, "0")}` <= current; mon === 12 ? ((year += 1), (mon = 1)) : (mon += 1)) {
    monthKeys.push(`${year}-${String(mon).padStart(2, "0")}`);
  }
  const months = monthKeys.map((month) => summarizeMonth(month, entries, payments, orders, partners, now));
  const selected = months.find((month) => month.month === selectedMonth) ?? months[months.length - 1];
  const upToSelected = months.slice(0, months.indexOf(selected) + 1);
  return {
    current,
    partners,
    cashReserve: settings.cashReserve,
    months,
    selected,
    accounts: partnerAccounts(upToSelected, partners, settings.cashReserve),
    closings: new Map(closings.map((closing) => [closing.month, closing])),
  };
}

/** Mês fechado? (lançamentos com data nesse mês ficam bloqueados até reabrir). */
export async function closedMonthFor(date: Date) {
  return prisma.monthClosing.findUnique({ where: { month: monthOf(date) }, select: { month: true } });
}
