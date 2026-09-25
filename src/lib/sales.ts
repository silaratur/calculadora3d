/**
 * Etapas da venda (execução), separadas do pagamento: em produção → aguardando
 * entrega (todas as peças concluídas) → entregue. O pagamento anda sozinho
 * (A receber / Parcial / Pago), só com os recebimentos registrados.
 */

export type SaleStage = "PRODUCING" | "AWAITING_DELIVERY" | "DELIVERED";

export const saleStageLabel: Record<SaleStage, string> = {
  PRODUCING: "Em produção",
  AWAITING_DELIVERY: "Aguardando entrega",
  DELIVERED: "Entregue",
};

export const paymentStatusLabel: Record<string, string> = { PENDING: "A receber", PARTIAL: "Parcial", PAID: "Pago" };

export function saleStage(order: { status: string; deliveredAt?: string | Date | null }): SaleStage {
  if (order.status !== "COMPLETED") return "PRODUCING";
  return order.deliveredAt ? "DELIVERED" : "AWAITING_DELIVERY";
}

/** Número exibido sem prefixo: orçamento e venda compartilham a numeração (ORC-/PED- só nos antigos). */
export function displayNumber(code: string | null | undefined) {
  return code ? `#${code.replace(/^(ORC|PED)-/, "")}` : "—";
}
