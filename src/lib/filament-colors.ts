// Cores oferecidas na loja = cores dos filamentos da Biblioteca. O nome da cor
// é texto livre no filamento, então a bolinha vem deste mapa — o mesmo da loja
// (loja-ac3d/src/lib/colors.ts), para a cor aparecer igual nos dois lugares.
const SWATCHES: [string[], string][] = [
  [["branco", "branca", "off white", "offwhite"], "#f7f5f0"],
  [["preto", "preta"], "#232323"],
  [["vermelho", "vermelha"], "#c62828"],
  [["vinho", "bordo", "bordô"], "#602f32"],
  [["rosa", "pink"], "#f2a7c3"],
  [["bege", "areia", "nude"], "#d8c3a5"],
  [["marrom", "madeira", "caramelo"], "#8a5a2e"],
  [["azul", "azul royal"], "#2c5bd4"],
  [["azul claro", "azul bebe", "azul bebê"], "#9ccbf0"],
  [["verde", "verde bandeira"], "#2e8b57"],
  [["verde oliva", "oliva"], "#777f5d"],
  [["amarelo", "amarela"], "#f4c430"],
  [["laranja"], "#f08a24"],
  [["roxo", "roxa", "lilas", "lilás"], "#8e6bbf"],
  [["cinza", "grafite"], "#8d8d8d"],
  [["dourado", "dourada", "ouro"], "#c9a24a"],
  [["prata", "prateado"], "#c0c0c0"],
];

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function swatch(color: string) {
  const name = normalize(color);
  for (const [names, hex] of SWATCHES) if (names.some((item) => normalize(item) === name)) return hex;
  for (const [names, hex] of SWATCHES) if (names.some((item) => name.startsWith(normalize(item)))) return hex;
  return "#b9a7a3";
}

export const sameColor = (a: string, b: string) => normalize(a) === normalize(b);

const FINISHES = ["fosco", "matte", "silk", "seda", "brilho", "glitter", "marmore", "translucido", "transparente"];
const finishOf = (text: string) => FINISHES.filter((word) => normalize(text).includes(word)).sort().join(" ");

function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Distância entre duas cores com peso perceptual (vermelho/verde/azul "redmean"). */
function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(swatch(a));
  const [r2, g2, b2] = rgb(swatch(b));
  const mean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

type FilamentLike = { id: string; type: string; color?: string; name: string; stockGrams?: number };

/**
 * Reposição de um filamento desativado: só candidatos do MESMO tipo (PLA branco
 * continua PLA, PETG branco continua PETG) e, entre eles, o mais parecido pela
 * cor, preferindo o mesmo acabamento (fosco, silk…) e quem tem estoque.
 * Retorna null se não houver nenhum filamento ativo do mesmo tipo.
 */
export function closestFilament<T extends FilamentLike>(target: FilamentLike, candidates: T[]): T | null {
  const targetColor = target.color || target.name;
  const scored = candidates
    .filter((item) => item.id !== target.id && normalize(item.type) === normalize(target.type))
    .map((item) => {
      const color = item.color || item.name;
      let score = sameColor(color, targetColor) ? 0 : colorDistance(color, targetColor);
      if (finishOf(color) !== finishOf(targetColor)) score += 25;
      if ((item.stockGrams ?? 0) <= 0) score += 400;
      return { item, score };
    })
    .sort((a, b) => a.score - b.score);
  return scored[0]?.item ?? null;
}

/** Uma opção por cor (PLA e PETG brancos viram um "Branco"), na ordem da Biblioteca. */
export function libraryColors(materials: { color?: string; stockGrams?: number }[]) {
  const colors: string[] = [];
  for (const material of materials) {
    const color = material.color?.trim();
    if (!color || (material.stockGrams ?? 0) <= 0) continue;
    if (!colors.some((item) => sameColor(item, color))) colors.push(color);
  }
  return colors;
}
