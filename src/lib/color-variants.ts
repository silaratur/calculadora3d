// Variações de cor de um produto do Catálogo (opção B): o produto é um só,
// com uma receita (filamento + gramas); a cor escolhida no orçamento troca o
// filamento por outro do MESMO TIPO naquela cor (PLA branco → PLA bege, nunca
// PETG). Regras combinadas com o usuário:
//   • preço único por produto — calculado com o filamento MAIS CARO entre as
//     cores oferecidas;
//   • o custo real de cada linha do orçamento usa o filamento da cor escolhida
//     (o preço fica, a margem varia);
//   • peças com mais de um filamento (AMS) não trocam de cor;
//   • a baixa de estoque sai do filamento da cor escolhida.
import { materialLineCost } from "@/lib/costing";
import { sameColor, swatch } from "@/lib/filament-colors";

export type VariantMaterial = { id: string; name: string; type: string; color?: string; active?: boolean; unitPrice: number; unitWeightGrams: number; stockGrams?: number };
type RecipeLine = { materialId: string; grams: number };
export type VariantProduct = { cost: number; materialCost: number; lossRatePercent?: number; colors?: string; materials?: RecipeLine[] };

const sameType = (a: VariantMaterial, b: VariantMaterial) => a.type.trim().toLowerCase() === b.type.trim().toLowerCase();
const colorOf = (material: VariantMaterial) => material.color || material.name;
const cents = (value: number) => Math.round(value * 100) / 100;

export function productColors(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Receita de um filamento só (a única que troca de cor) — null para peças AMS ou sem filamento. */
export function singleFilamentRecipe<M extends VariantMaterial>(product: { materials?: RecipeLine[] }, materials: M[]) {
  if (product.materials?.length !== 1) return null;
  const line = product.materials[0];
  const base = materials.find((item) => item.id === line.materialId);
  return base ? { grams: line.grams, base } : null;
}

/**
 * Filamento do mesmo tipo da receita na cor pedida: primeiro o nome exato da
 * cor ("Bege Caucasiano"), depois a mesma família de cor ("Branco" ↔ "Branco
 * Fosco"). A própria receita vale se já for dessa cor. Ativos têm preferência.
 */
export function filamentForColor<M extends VariantMaterial>(base: M, color: string, materials: M[]): M | null {
  if (sameColor(colorOf(base), color)) return base;
  const candidates = materials.filter((item) => item.id !== base.id && item.active !== false && sameType(item, base));
  return (
    candidates.find((item) => sameColor(colorOf(item), color)) ??
    candidates.find((item) => swatch(colorOf(item)) === swatch(color) && swatch(color) !== swatch("?")) ??
    null
  );
}

/** Cor da própria receita, se ela estiver entre as oferecidas; senão a primeira oferecida. */
export function defaultColor<M extends VariantMaterial>(product: { colors?: string; materials?: RecipeLine[] }, materials: M[]) {
  const colors = productColors(product.colors);
  const recipe = singleFilamentRecipe(product, materials);
  if (!recipe || !colors.length) return "";
  return colors.find((color) => filamentForColor(recipe.base, color, materials)?.id === recipe.base.id) ?? colors[0];
}

/** Entre a receita e as cores oferecidas, o filamento mais caro por grama — é com ele que o preço do Catálogo é calculado. */
export function mostExpensiveColorFilament<M extends VariantMaterial>(base: M, colors: string[], materials: M[]): M {
  const perGram = (material: M) => materialLineCost(material, 1);
  return colors
    .map((color) => filamentForColor(base, color, materials))
    .filter((item): item is M => Boolean(item))
    .reduce((top, item) => (perGram(item) > perGram(top) ? item : top), base);
}

/**
 * Custo real de uma unidade na cor escolhida: o custo do Catálogo com o
 * filamento trocado (a reserva de perdas incide sobre a diferença também).
 */
export function colorUnitCost(product: VariantProduct, grams: number, material: VariantMaterial) {
  const difference = materialLineCost(material, grams) - product.materialCost;
  return cents(product.cost + difference * (1 + (product.lossRatePercent ?? 0) / 100));
}

/**
 * Resolve a cor de uma linha de orçamento: filamento a usar e custo unitário.
 * Sem cor, peça AMS ou cor sem filamento do mesmo tipo → custo do Catálogo e
 * filamento da receita (ou nenhum).
 */
export function resolveColorLine<M extends VariantMaterial>(product: VariantProduct, color: string, materials: M[]) {
  const recipe = singleFilamentRecipe(product, materials);
  if (!recipe || !color) return { material: recipe?.base ?? null, unitCost: product.cost, matched: false };
  const material = filamentForColor(recipe.base, color, materials);
  if (!material) return { material: recipe.base, unitCost: product.cost, matched: false };
  return { material, unitCost: colorUnitCost(product, recipe.grams, material), matched: true };
}
