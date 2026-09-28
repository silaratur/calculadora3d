import { roundPriceTo90 } from "@/lib/costing";

// Avaliação de preços contra a concorrência (Shopee, Mercado Livre, Elo7…):
// cada anúncio vira um preço POR UNIDADE com frete, e o produto é comparado
// com a mediana desses preços — sem esquecer o custo e a margem mínima.

export type CompetitorEntry = { id: string; productId: string | null; competitor: string; channel: string; price: number; quantity: number; shipping: number; checkedAt: string };
export type EvaluatedProduct = { price: number; cost: number };
export type Position = "abaixo" | "media" | "acima" | "mercado-abaixo-do-custo";

export const TARGET_MARGIN = 30; // % — mesma meta usada nos reajustes de 28/09/2026
export const STALE_DAYS = 30;

/** "Kit 10 por R$ 49 + R$ 15 de frete" → R$ 6,40 por unidade. */
export const unitPrice = (entry: Pick<CompetitorEntry, "price" | "quantity" | "shipping">) => (entry.price + entry.shipping) / Math.max(entry.quantity, 1);

export const isStale = (entry: Pick<CompetitorEntry, "checkedAt">, now = Date.now()) => now - new Date(entry.checkedAt).getTime() > STALE_DAYS * 86400000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Maior preço terminado em ,90 que não passa de `value` (13,40 → 12,90). */
const floorTo90 = (value: number) => Math.max(0.9, Math.floor(value - 0.9 + 1e-6) + 0.9);

export type Evaluation = {
  count: number;
  stale: number;
  min: number;
  median: number;
  max: number;
  /** Diferença do meu preço para a mediana, em % (negativo = mais barato). */
  diffPercent: number;
  position: Position;
  /** Menor preço que ainda dá a margem meta (,90). */
  floorPrice: number;
  recommendation: string;
  /** Preço sugerido, quando a recomendação é mudar. */
  suggestedPrice: number | null;
};

export function evaluatePrice(product: EvaluatedProduct, entries: CompetitorEntry[]): Evaluation | null {
  if (!entries.length) return null;
  const units = entries.map(unitPrice);
  const med = median(units);
  const floorPrice = roundPriceTo90(product.cost / (1 - TARGET_MARGIN / 100));
  const diffPercent = ((product.price - med) / med) * 100;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const marginAt = (price: number) => (((price - product.cost) / price) * 100).toFixed(0);

  let position: Position;
  let recommendation: string;
  let suggestedPrice: number | null = null;
  if (med < product.cost) {
    position = "mercado-abaixo-do-custo";
    recommendation = `O mercado vende abaixo do seu custo (${brl(product.cost)}). Não compita em preço: destaque qualidade, cores e personalização.`;
  } else if (diffPercent < -10) {
    position = "abaixo";
    const target = Math.max(product.price, floorTo90(med));
    suggestedPrice = target > product.price ? target : null;
    recommendation = suggestedPrice
      ? `Você está ${Math.abs(diffPercent).toFixed(0)}% abaixo da mediana — dá para subir até ${brl(suggestedPrice)} (margem ${marginAt(suggestedPrice)}%).`
      : `Você está abaixo da mediana, mas perto do limite de ,90 — manter.`;
  } else if (diffPercent > 10) {
    position = "acima";
    const target = Math.max(floorPrice, floorTo90(med));
    if (target < product.price) {
      suggestedPrice = target;
      recommendation = `Você está ${diffPercent.toFixed(0)}% acima da mediana — considere ${brl(target)} (margem ${marginAt(target)}%).`;
    } else {
      recommendation = `Acima da mediana, mas baixar tiraria sua margem mínima de ${TARGET_MARGIN}% (preço mínimo ${brl(floorPrice)}). Destaque os diferenciais.`;
    }
  } else {
    position = "media";
    recommendation = "Na média do mercado — manter.";
  }
  return { count: entries.length, stale: entries.filter((entry) => isStale(entry)).length, min: Math.min(...units), median: med, max: Math.max(...units), diffPercent, position, floorPrice, recommendation, suggestedPrice };
}
