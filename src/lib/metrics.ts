import { isRealized } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

type CashEntryLike = { type: string; status: string; amount: number; date: Date; sourceType: string | null };
type OpenOrderLike = { totalAmount: number; paidAmount: number };

/**
 * Resumo de caixa a partir de dados já buscados — usado pelo Fluxo de Caixa
 * (que já tem o extrato completo em mãos) e pelo Painel (que só precisa da
 * soma). Extraído para um só lugar depois que as duas telas quase divergiram:
 * cada uma calculava o mesmo número com sua própria cópia da fórmula.
 */
export function summarizeCash(entries: CashEntryLike[], openOrders: OpenOrderLike[]) {
  // Lançamento com data futura não conta no saldo de hoje; custo fixo conta quando o mês chega.
  const realized = entries.filter((entry) => isRealized(entry));
  const totalIn = realized.filter((entry) => entry.type === "IN").reduce((sum, entry) => sum + entry.amount, 0);
  const totalOut = realized.filter((entry) => entry.type === "OUT").reduce((sum, entry) => sum + entry.amount, 0);
  const balance = totalIn - totalOut;
  const receivable = openOrders.reduce((sum, order) => sum + Math.max(order.totalAmount - order.paidAmount, 0), 0);
  return { totalIn, totalOut, balance, receivable, projectedBalance: balance + receivable };
}

export async function getCashSummary() {
  const [entries, openOrders] = await Promise.all([
    prisma.cashEntry.findMany({ select: { type: true, status: true, amount: true, date: true, sourceType: true } }),
    prisma.salesOrder.findMany({ where: { paymentStatus: { not: "PAID" } }, select: { totalAmount: true, paidAmount: true } }),
  ]);
  return summarizeCash(entries, openOrders);
}
