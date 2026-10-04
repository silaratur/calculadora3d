// Loja → Vitrine: regras compartilhadas entre o painel e a API pública
// (coleções editáveis, banner da abertura, selos e período).

export const COLLECTION_TONES = ["vinho", "rosa", "oliva"] as const;
export type CollectionTone = (typeof COLLECTION_TONES)[number];

/** Selos sugeridos no painel; o campo aceita texto livre (até 24 letras). */
export const BADGE_PRESETS = ["Novo", "Edição de Natal", "Últimas unidades", "Mais vendido", "Exclusivo", "Presente perfeito"];

type Period = { startsAt: Date | null; endsAt: Date | null; active: boolean };
export type PeriodStatus = "no ar" | "agendado" | "encerrado" | "pausado";

/** Situação de algo com período (coleção, banner). */
export function periodStatus(item: Period, now = new Date()): PeriodStatus {
  if (!item.active) return "pausado";
  if (item.endsAt && item.endsAt.getTime() < now.getTime()) return "encerrado";
  if (item.startsAt && item.startsAt.getTime() > now.getTime()) return "agendado";
  return "no ar";
}

/** productIds do banco (JSON) → lista de ids. */
export function parseIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Caminho público da foto `index` de um produto, igual à API da vitrine: foto em
 * data URI vai pela rota que decodifica; arquivo (ex.: /catalogo/D.001.webp) vai direto.
 */
export function productImagePath(product: { id: string; imageUrl: string; extraImages: string; updatedAt: Date }, index: number): string | null {
  const sources = [product.imageUrl, ...parseIds(product.extraImages)].filter(Boolean);
  const src = sources[index] ?? sources[0];
  if (!src) return null;
  const position = sources[index] ? index : 0;
  return src.startsWith("data:") ? `/api/public/products/${product.id}/image/${position}?v=${product.updatedAt.getTime()}` : src;
}
