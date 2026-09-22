export const PRODUCTION_STATUSES = ["WAITING", "PRINTING", "FINISHING", "COMPLETED"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

// O board de produção usa WAITING/PRINTING/FINISHING/COMPLETED, mas Vendas
// filtra pedidos por PENDING/IN_PROGRESS/COMPLETED (SalesOrder.status).
export const jobToOrderStatus: Record<ProductionStatus, string> = {
  WAITING: "PENDING",
  PRINTING: "IN_PROGRESS",
  FINISHING: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

/**
 * Status do pedido (ProductionJob) = pior caso entre os itens: só "pronto"
 * quando a última peça chegar em Concluído, só "na fila" enquanto nenhuma
 * peça começou. Qualquer mistura no meio conta como "em andamento".
 */
export function rollupStatus(itemStatuses: string[]): ProductionStatus {
  if (itemStatuses.length > 0 && itemStatuses.every((status) => status === "COMPLETED")) return "COMPLETED";
  if (itemStatuses.every((status) => status === "WAITING")) return "WAITING";
  return "PRINTING";
}

import type { PrismaClient } from "@prisma/client";

export type SnapshotProductLine = { id?: string; name: string; quantity?: number };

/**
 * Quebra o snapshot de um orçamento (Quote.snapshotJson) na lista real de
 * peças a produzir. Sem snapshot ou sem `products` (orçamento antigo,
 * pré-Catálogo, ou venda avulsa sem orçamento), cai num item único a partir
 * do próprio pedido — mesmo fallback que a tela de Produção já usava antes
 * de existir ProductionItem.
 */
export function parseSnapshotProductLines(snapshotJson: string | null | undefined): SnapshotProductLine[] | null {
  if (!snapshotJson) return null;
  try {
    const snapshot = JSON.parse(snapshotJson) as { products?: SnapshotProductLine[] };
    return snapshot.products?.length ? snapshot.products : null;
  } catch {
    return null;
  }
}

export type ProductionItemDraft = { name: string; quantity: number; productId: string | null };

/**
 * Monta a lista de ProductionItem a criar para um pedido novo: uma peça por
 * produto do orçamento de origem (quando veio de um orçamento com Catálogo),
 * ou o item único de `fallback` (venda avulsa / orçamento antigo sem lista).
 * Ids de produto que não existem mais no Catálogo caem como null (a peça
 * continua rastreável, só perde o vínculo pra baixa de estoque automática).
 */
export async function buildProductionItemDrafts(
  prisma: Pick<PrismaClient, "product">,
  snapshotJson: string | null | undefined,
  fallback: ProductionItemDraft,
): Promise<ProductionItemDraft[]> {
  const lines = parseSnapshotProductLines(snapshotJson);
  if (!lines) return [fallback];

  const ids = lines.map((line) => line.id).filter((id): id is string => Boolean(id));
  const validIds = ids.length
    ? new Set((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id))
    : new Set<string>();

  return lines.map((line) => ({
    name: line.name,
    quantity: line.quantity || 1,
    productId: line.id && validIds.has(line.id) ? line.id : null,
  }));
}
