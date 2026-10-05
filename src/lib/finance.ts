// Dinheiro → Fechamento: números do mês pelo regime de caixa (o faturamento é o
// que foi RECEBIDO no mês — decisão do usuário em 05/10/2026), retiradas e
// aportes dos sócios e o quanto cada um ainda pode retirar.
// Mês = mês de Brasília (UTC-3).

export type FinanceEntry = { date: Date; type: string; status: string; category: string; amount: number; sourceType: string | null; partner: string; description: string };
export type Partner = { name: string; share: number };
export type PaymentLike = { date: Date; amount: number; reversedAt: Date | null; order: { totalAmount: number; quantity: number; unitCostSnapshot: number } };
export type OrderLike = { createdAt: Date; totalAmount: number; paidAmount: number };

export const WITHDRAWAL = "Retirada de sócio";
export const CONTRIBUTION = "Aporte de sócio";
export const BOTH = "Ambos";

const BRT = 3 * 3_600_000;
/** "2026-09" do instante, no fuso de Brasília. */
export const monthOf = (date: Date) => new Date(date.getTime() - BRT).toISOString().slice(0, 7);
/** Início (00:00 de Brasília do dia 1º) e fim (início do mês seguinte) do mês. */
export function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(year, mon - 1, 1) + BRT), end: new Date(Date.UTC(year, mon, 1) + BRT) };
}
export const monthLabel = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
};

/**
 * Já entrou/saiu do caixa? Lançamento com data futura nunca conta no saldo de
 * hoje; custo fixo previsto passa a contar quando o mês chega (é pago todo mês).
 */
export function isRealized(entry: Pick<FinanceEntry, "date" | "status" | "sourceType">, now = new Date()) {
  if (entry.date.getTime() > now.getTime()) return false;
  return entry.status === "REALIZED" || entry.sourceType === "FIXED_COST";
}

export function parsePartners(raw: string): Partner[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed.filter((item): item is Partner => typeof item?.name === "string" && item.name.trim() !== "" && typeof item?.share === "number") : [];
    return list.length ? list : [{ name: "Sócio 1", share: 50 }, { name: "Sócio 2", share: 50 }];
  } catch {
    return [{ name: "Sócio 1", share: 50 }, { name: "Sócio 2", share: 50 }];
  }
}

type Kind = "receipt" | "reversal" | "contribution" | "otherIn" | "withdrawal" | "investment" | "fixed" | "variable" | "otherOut";
export function kindOf(entry: Pick<FinanceEntry, "type" | "category" | "sourceType">): Kind {
  if (entry.type === "IN") {
    if (entry.sourceType === "PAYMENT" || entry.category === "Venda") return "receipt";
    if (entry.category === CONTRIBUTION) return "contribution";
    return "otherIn";
  }
  if (entry.sourceType === "PAYMENT_REVERSAL") return "reversal";
  if (entry.category === WITHDRAWAL) return "withdrawal";
  if (entry.category === "Investimento") return "investment";
  if (entry.sourceType === "FIXED_COST" || entry.category === "Custo Fixo") return "fixed";
  if (entry.sourceType === "VARIABLE_COST" || entry.category === "Custo Variável") return "variable";
  return "otherOut";
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** Quanto de cada lançamento de sócio é de cada um ("Ambos" divide pela participação). */
function splitByPartner(entries: FinanceEntry[], partners: Partner[]) {
  const totals = new Map(partners.map((partner) => [partner.name, 0]));
  const shareSum = partners.reduce((sum, partner) => sum + partner.share, 0) || 1;
  for (const entry of entries) {
    if (entry.partner && entry.partner !== BOTH && totals.has(entry.partner)) totals.set(entry.partner, totals.get(entry.partner)! + entry.amount);
    else for (const partner of partners) totals.set(partner.name, totals.get(partner.name)! + (entry.amount * partner.share) / shareSum);
  }
  return totals;
}

export type MonthSummary = ReturnType<typeof summarizeMonth>;

/** Números de um mês (regime de caixa) + saldo de caixa no início e no fim. */
export function summarizeMonth(month: string, entries: FinanceEntry[], payments: PaymentLike[], orders: OrderLike[], partners: Partner[], now = new Date()) {
  const { start, end } = monthRange(month);
  const realized = entries.filter((entry) => isRealized(entry, now));
  const inMonth = realized.filter((entry) => entry.date >= start && entry.date < end);
  const sum = (kind: Kind) => cents(inMonth.filter((entry) => kindOf(entry) === kind).reduce((total, entry) => total + entry.amount, 0));
  const balanceBefore = (limit: Date) => cents(realized.filter((entry) => entry.date < limit).reduce((total, entry) => total + (entry.type === "IN" ? entry.amount : -entry.amount), 0));
  const opening = balanceBefore(start);

  const receipts = sum("receipt");
  const reversals = sum("reversal");
  const revenue = cents(receipts - reversals);
  const otherIn = sum("otherIn");
  const contributions = sum("contribution");
  const fixed = sum("fixed");
  const variable = sum("variable");
  const otherOut = sum("otherOut");
  const investments = sum("investment");
  const withdrawals = sum("withdrawal");
  const operatingCosts = cents(fixed + variable + otherOut);
  // Resultado do mês: o que a operação gerou de caixa (sem investimentos, retiradas e aportes).
  const result = cents(revenue + otherIn - operatingCosts);
  // Direto da soma dos lançamentos (não das linhas arredondadas) para o saldo final bater com o inicial do mês seguinte.
  const closing = balanceBefore(end);

  // Custo de produção das peças recebidas no mês (proporcional ao que foi pago de cada pedido).
  const paidInMonth = payments.filter((payment) => !payment.reversedAt && payment.date >= start && payment.date < end);
  const productCost = cents(paidInMonth.reduce((total, payment) => total + (payment.order.totalAmount > 0 ? (payment.amount / payment.order.totalAmount) * payment.order.unitCostSnapshot * payment.order.quantity : 0), 0));

  const ordersInMonth = orders.filter((order) => order.createdAt >= start && order.createdAt < end);
  const planned = entries.filter((entry) => entry.date >= start && entry.date < end && !isRealized(entry, now));

  const withdrawalEntries = inMonth.filter((entry) => kindOf(entry) === "withdrawal");
  const contributionEntries = inMonth.filter((entry) => kindOf(entry) === "contribution");
  const byPartnerOut = splitByPartner(withdrawalEntries, partners);
  const byPartnerIn = splitByPartner(contributionEntries, partners);

  return {
    month,
    label: monthLabel(month),
    opening,
    revenue,
    receipts,
    reversals,
    receiptsCount: inMonth.filter((entry) => kindOf(entry) === "receipt").length,
    otherIn,
    contributions,
    fixed,
    variable,
    otherOut,
    operatingCosts,
    investments,
    withdrawals,
    result,
    closing,
    productCost,
    grossMarginOnReceived: cents(revenue - productCost),
    ordersCount: ordersInMonth.length,
    ordersTotal: cents(ordersInMonth.reduce((total, order) => total + order.totalAmount, 0)),
    ordersOpen: cents(ordersInMonth.reduce((total, order) => total + Math.max(order.totalAmount - order.paidAmount, 0), 0)),
    plannedOut: cents(planned.filter((entry) => entry.type === "OUT").reduce((total, entry) => total + entry.amount, 0)),
    partners: partners.map((partner) => ({ name: partner.name, share: partner.share, withdrawals: cents(byPartnerOut.get(partner.name) ?? 0), contributions: cents(byPartnerIn.get(partner.name) ?? 0) })),
    entries: inMonth
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry) => ({ date: entry.date.toISOString(), kind: kindOf(entry), type: entry.type, category: entry.category, description: entry.description, amount: entry.amount, partner: entry.partner })),
  };
}

/**
 * Conta de cada sócio até o fim do mês: parte do resultado acumulado (pela
 * participação) + aportes − retiradas = quanto ainda tem para retirar. O caixa
 * limita: não dá para retirar mais do que o saldo menos a reserva.
 */
export function partnerAccounts(months: MonthSummary[], partners: Partner[], cashReserve: number) {
  const shareSum = partners.reduce((sum, partner) => sum + partner.share, 0) || 1;
  const accumulatedResult = cents(months.reduce((total, month) => total + month.result, 0));
  const last = months[months.length - 1];
  const availableCash = cents(Math.max(0, (last?.closing ?? 0) - cashReserve));
  return {
    accumulatedResult,
    availableCash,
    partners: partners.map((partner) => {
      const share = accumulatedResult * (partner.share / shareSum);
      const withdrawn = months.reduce((total, month) => total + (month.partners.find((item) => item.name === partner.name)?.withdrawals ?? 0), 0);
      const contributed = months.reduce((total, month) => total + (month.partners.find((item) => item.name === partner.name)?.contributions ?? 0), 0);
      const balance = cents(share + contributed - withdrawn);
      return { name: partner.name, share: partner.share, resultShare: cents(share), contributed: cents(contributed), withdrawn: cents(withdrawn), balance, canWithdrawNow: cents(Math.max(0, Math.min(balance, availableCash * (partner.share / shareSum)))) };
    }),
  };
}
