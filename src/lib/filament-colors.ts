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
