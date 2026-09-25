import { prisma } from "@/lib/prisma";

/**
 * Numeração única de orçamentos e vendas: AAAAMMDD-0001, sequencial por dia e
 * compartilhada entre os dois. A venda que nasce de um orçamento herda o número
 * dele (orderNumberForQuote); venda direta (sem orçamento) pega o próximo da
 * mesma sequência. Códigos antigos (ORC-… / PED-…) continuam como estão — o
 * Caixa e PDFs já enviados citam esses códigos.
 */

/** AAAAMMDD no fuso local — perto da meia-noite no Brasil toISOString() já mostraria o dia seguinte. */
export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function seqOf(code: string | null | undefined) {
  return code ? Number(code.split("-").pop()) || 0 : 0;
}

/** Próximo número livre do dia, olhando orçamentos e vendas (inclusive os ORC-/PED- de hoje, criados antes da unificação). */
export async function nextSharedCode(date = new Date()) {
  const day = localDateKey(date);
  const [quotes, orders] = await Promise.all([
    prisma.quote.findMany({
      where: { OR: [{ code: { startsWith: `${day}-` } }, { code: { startsWith: `ORC-${day}-` } }] },
      select: { code: true },
    }),
    prisma.salesOrder.findMany({
      where: { OR: [{ orderNumber: { startsWith: `${day}-` } }, { orderNumber: { startsWith: `PED-${day}-` } }] },
      select: { orderNumber: true },
    }),
  ]);
  const last = Math.max(0, ...quotes.map((quote) => seqOf(quote.code)), ...orders.map((order) => seqOf(order.orderNumber)));
  return `${day}-${String(last + 1).padStart(4, "0")}`;
}

/**
 * Número da venda que nasce de um orçamento: o mesmo do orçamento (sem o "ORC-"
 * dos códigos antigos). Se esse número já estiver em uso por outra venda — ou o
 * orçamento é tão antigo que nem tem código — cai no próximo livre.
 */
export async function orderNumberForQuote(quoteCode: string | null) {
  const inherited = quoteCode ? quoteCode.replace(/^ORC-/, "") : null;
  if (inherited) {
    const taken = await prisma.salesOrder.findUnique({ where: { orderNumber: inherited }, select: { id: true } });
    if (!taken) return inherited;
  }
  return nextSharedCode();
}
