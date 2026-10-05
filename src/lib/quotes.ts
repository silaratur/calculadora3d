/**
 * Regras do ciclo do orçamento (negociação), separado da venda: em aberto →
 * aprovado (virou venda) ou reprovado. Enquanto está em aberto pode mudar
 * quantas vezes precisar; cada mudança de preço ou de itens gera uma revisão.
 */

export const quoteStatusLabel: Record<string, string> = { DRAFT: "Em aberto", CONVERTED: "Aprovado", ARCHIVED: "Reprovado" };

type SnapshotItems = {
  products?: { id?: string; quantity?: number; color?: string }[];
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
  const products = (snapshot.products ?? []).map((item) => `p:${item.id}:${item.color ?? ""}:${item.quantity ?? 1}`);
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

type SnapshotPrices = {
  products?: { id?: string; name?: string; quantity?: number; unitPrice?: number; custom?: boolean; size?: string }[];
  calculations?: { productsCost?: number; subtotal?: number };
};

export type CatalogPriceDrift = {
  /** Soma dos preços do Catálogo quando o orçamento foi salvo. */
  savedBase: number;
  /** A mesma soma com os preços de hoje. */
  currentBase: number;
  /** Produtos cujo preço mudou (só em orçamentos que já guardam o preço por item). */
  changes: { name: string; before: number; after: number }[];
};

/**
 * Os preços do Catálogo mudaram desde que o orçamento foi salvo? Compara item
 * a item quando o snapshot tem o preço de cada produto (unitPrice, gravado a
 * partir de 28/09/2026); nos anteriores, compara pela soma salva. Null quando
 * não mudou nada ou não dá para saber (produto excluído, snapshot sem itens).
 */
export function catalogPriceDrift(snapshotJson: string, currentPrice: (productId: string, size?: string) => number | undefined): CatalogPriceDrift | null {
  let snapshot: SnapshotPrices;
  try {
    snapshot = JSON.parse(snapshotJson) as SnapshotPrices;
  } catch {
    return null;
  }
  const lines = snapshot.products ?? [];
  if (!lines.length) return null;
  let currentBase = 0;
  const changes: CatalogPriceDrift["changes"] = [];
  for (const line of lines) {
    // Peça sob medida não está no Catálogo: entra pelo preço salvo e nunca "muda".
    if (line.custom) {
      currentBase += (line.unitPrice ?? 0) * (Number(line.quantity) || 1);
      continue;
    }
    // Linha com tamanho compara com o preço daquele tamanho hoje.
    const now = line.id ? currentPrice(line.id, line.size) : undefined;
    if (now === undefined) return null;
    currentBase += now * (Number(line.quantity) || 1);
    if (typeof line.unitPrice === "number" && Math.abs(line.unitPrice - now) >= 0.005) changes.push({ name: line.name ?? "", before: line.unitPrice, after: now });
  }
  const perItem = lines.every((line) => typeof line.unitPrice === "number");
  const savedBase = perItem
    ? lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * (Number(line.quantity) || 1), 0)
    : Number(snapshot.calculations?.productsCost ?? snapshot.calculations?.subtotal);
  if (!Number.isFinite(savedBase)) return null;
  if (Math.abs(currentBase - savedBase) < 0.01 && !changes.length) return null;
  return { savedBase, currentBase, changes };
}

/** Preço de hoje de um produto no tamanho da linha (sem tamanho, ou tamanho que saiu = preço do cadastro). */
export function sizedPrice(product: { price: number; sizeOptions?: string } | undefined, size?: string) {
  if (!product) return undefined;
  if (!size) return product.price;
  try {
    const sizes = JSON.parse(product.sizeOptions ?? "[]") as { name?: string; price?: number }[];
    const match = Array.isArray(sizes) ? sizes.find((item) => item?.name === size && typeof item.price === "number") : undefined;
    return match?.price ?? product.price;
  } catch {
    return product.price;
  }
}
