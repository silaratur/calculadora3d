/**
 * Regras do ciclo do orçamento (negociação), separado da venda: em aberto →
 * aprovado (virou venda) ou reprovado. Enquanto está em aberto pode mudar
 * quantas vezes precisar; cada mudança de preço ou de itens gera uma revisão.
 */

export const quoteStatusLabel: Record<string, string> = { DRAFT: "Em aberto", CONVERTED: "Aprovado", ARCHIVED: "Reprovado" };

type SnapshotItems = {
  products?: { id?: string; quantity?: number }[];
  supplies?: { id?: string; quantity?: number }[];
  customExtras?: { name?: string; price?: number | string; quantity?: number }[];
};

/** Assinatura dos itens do orçamento (produtos, insumos e extras com quantidade) — ignora ordem e campos que não são "o que vai ser entregue". */
export function quoteItemsSignature(snapshotJson: string) {
  let snapshot: SnapshotItems = {};
  try {
    snapshot = JSON.parse(snapshotJson) as SnapshotItems;
  } catch {
    return snapshotJson;
  }
  const products = (snapshot.products ?? []).map((item) => `p:${item.id}:${item.quantity ?? 1}`);
  const supplies = (snapshot.supplies ?? []).map((item) => `s:${item.id}:${item.quantity ?? 1}`);
  const extras = (snapshot.customExtras ?? []).map((item) => `e:${item.name}:${item.price}:${item.quantity ?? 1}`);
  return [...products, ...supplies, ...extras].sort().join("|");
}

/** Mudou o que interessa pra negociação (preço final ou itens)? Então a versão anterior vira revisão. */
export function isNewRevision(
  previous: { finalPrice: number; snapshotJson: string },
  next: { finalPrice: number; snapshotJson: string },
) {
  const priceChanged = Math.abs(previous.finalPrice - next.finalPrice) >= 0.005;
  return priceChanged || quoteItemsSignature(previous.snapshotJson) !== quoteItemsSignature(next.snapshotJson);
}

type SnapshotCosts = {
  products?: { unitCost?: number; quantity?: number }[];
  supplies?: { unitCost?: number; quantity?: number }[];
  customExtras?: { unitCost?: number }[];
};

/**
 * Custo real de produção do orçamento: produtos pelo CUSTO do Catálogo (não o
 * preço de venda), mais insumos e extras. O "custo base" do orçamento
 * (Quote.baseCost) soma os PREÇOS de venda dos produtos — é a base do markup,
 * não o custo; usar ele como custo da venda subestimava o lucro. Null quando o
 * snapshot não tem itens (orçamento antigo/avulso), pra quem chama cair no baseCost.
 */
export function quoteRealCost(snapshotJson: string): number | null {
  let snapshot: SnapshotCosts;
  try {
    snapshot = JSON.parse(snapshotJson) as SnapshotCosts;
  } catch {
    return null;
  }
  const products = snapshot.products ?? [];
  const supplies = snapshot.supplies ?? [];
  const extras = snapshot.customExtras ?? [];
  if (!products.length && !supplies.length && !extras.length) return null;
  const sum = (lines: { unitCost?: number; quantity?: number }[]) => lines.reduce((total, line) => total + (Number(line.unitCost) || 0) * (Number(line.quantity) || 1), 0);
  return sum(products) + sum(supplies) + extras.reduce((total, line) => total + (Number(line.unitCost) || 0), 0);
}
