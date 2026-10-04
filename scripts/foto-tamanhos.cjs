// Foto de tamanhos e preços do Catálogo: produto vendido em mais de um tamanho.
// Sobre a foto frontal das peças lado a lado (fundo liso), desenha uma régua em
// cm, a altura e a largura de cada peça e uma etiqueta com nome, tamanho e PREÇO.
// Régua e etiquetas são escuras (vinho da marca) com texto claro, para nunca
// sumirem no fundo claro.
//
//   node scripts/foto-tamanhos.cjs <entrada> <saida.png> --item "Grande|20|10|44,90" --item "Pequena|15|7,5|37,90"
//        (um --item por peça, da esquerda para a direita: nome|altura cm|largura cm|preço)
//        [--legenda-largura diâmetro] [--encolher 0.8]  (reduz a foto espelhando o fundo, abrindo espaço embaixo)
const sharp = require("sharp");

const WIDTH = 1024;
const HEIGHT = 768;
const INK = "#602f32"; // vinho da marca
const LIGHT = "#fbf6ef";
const FONT = "Arial, Helvetica, sans-serif";

const args = process.argv.slice(2);
const [input, output] = args;
const items = args.flatMap((value, i) => (args[i - 1] === "--item" ? [value] : [])).map((raw) => {
  const [name, height, width, price] = raw.split("|");
  return { name, height: Number(height.replace(",", ".")), width: Number(width.replace(",", ".")), price };
});
const widthWord = args[args.indexOf("--legenda-largura") + 1] && args.includes("--legenda-largura") ? args[args.indexOf("--legenda-largura") + 1] : "largura";
const cm = (value) => `${String(value).replace(".", ",")} cm`;

/** Peças em fundo liso: máscara pela cor dos cantos, separadas pelas colunas vazias. */
async function detectBoxes(buffer, count) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const corners = [at(4, 4), at(info.width - 5, 4), at(4, info.height - 5), at(info.width - 5, info.height - 5)];
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, px) => sum + px[c], 0) / corners.length);
  const isProduct = (x, y) => { const px = at(x, y); return Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) > 70; };
  const columns = new Array(info.width).fill(0);
  for (let y = 0; y < info.height; y += 2) for (let x = 0; x < info.width; x += 1) if (isProduct(x, y)) columns[x] += 1;
  // Colunas com produto (ignora sombra fraca), agrupadas em faixas contíguas.
  const runs = [];
  let start = -1;
  for (let x = 0; x <= info.width; x += 1) {
    const on = x < info.width && columns[x] > 6;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  const groups = runs.filter(([a, b]) => b - a > 12).sort((r1, r2) => (r2[1] - r2[0]) - (r1[1] - r1[0])).slice(0, count).sort((r1, r2) => r1[0] - r2[0]);
  if (groups.length < count) throw new Error(`Achei ${groups.length} peça(s), esperava ${count}`);
  return groups.map(([x0, x1]) => {
    let y0 = info.height, y1 = -1;
    for (let y = 0; y < info.height; y += 1) for (let x = x0; x <= x1; x += 2) if (isProduct(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
}

const pill = (cx, y, text, size = 17) => {
  const width = text.length * size * 0.6 + 26;
  return `<rect x="${cx - width / 2}" y="${y - size - 4}" width="${width}" height="${size + 16}" rx="${(size + 16) / 2}" fill="${INK}"/>
    <text x="${cx}" y="${y + 3}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${LIGHT}">${text}</text>`;
};
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="3" marker-start="url(#a)" marker-end="url(#a)"/>`;

async function main() {
  if (!input || !output || items.length < 1 || items.some((item) => !(item.height > 0) || !item.price)) {
    console.error('Uso: node scripts/foto-tamanhos.cjs <entrada> <saida.png> --item "Grande|20|10|44,90" --item "Pequena|15|7,5|37,90"');
    process.exit(1);
  }
  let base = await sharp(input).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
  const shrink = args.includes("--encolher") ? Number(args[args.indexOf("--encolher") + 1]) : 1;
  if (shrink > 0 && shrink < 1) {
    // Abre espaço embaixo repetindo a última linha do fundo (espelhar refletiria as peças) e volta ao 4:3.
    const extra = Math.round(HEIGHT / shrink - HEIGHT);
    const tall = await sharp(base).extend({ bottom: extra, extendWith: "copy" }).toBuffer();
    const scaledWidth = Math.round(WIDTH * shrink);
    const scaled = await sharp(tall).resize(scaledWidth, HEIGHT).toBuffer();
    const side = (WIDTH - scaledWidth) / 2;
    base = await sharp(scaled).extend({ left: Math.floor(side), right: Math.ceil(side), extendWith: "mirror" }).png().toBuffer();
  }
  const boxes = await detectBoxes(base, items.length);
  const tallest = items.reduce((best, item, i) => (item.height > items[best].height ? i : best), 0);
  const pxPerCm = boxes[tallest].h / items[tallest].height;
  const floor = Math.max(...boxes.map((box) => box.y + box.h));

  const parts = [];
  // Régua vertical à esquerda, do chão até a altura da maior peça (+1 cm).
  const maxCm = Math.ceil(items[tallest].height) + 1;
  const rx = Math.max(18, Math.min(...boxes.map((box) => box.x)) - 110);
  parts.push(`<rect x="${rx}" y="${floor - maxCm * pxPerCm - 10}" width="46" height="${maxCm * pxPerCm + 20}" rx="6" fill="${INK}"/>`);
  for (let v = 0; v <= maxCm; v += 1) {
    const y = floor - v * pxPerCm;
    const long = v % 5 === 0;
    parts.push(`<line x1="${rx + 46}" y1="${y}" x2="${rx + 46 - (long ? 18 : 10)}" y2="${y}" stroke="${LIGHT}" stroke-width="${long ? 2.4 : 1.4}"/>`);
    if (long) parts.push(`<text x="${rx + 6}" y="${y + 5}" font-family="${FONT}" font-size="14" font-weight="700" fill="${LIGHT}">${v}</text>`);
  }
  parts.push(`<text x="${rx + 23}" y="${floor + 26}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="${INK}">cm</text>`);

  boxes.forEach((box, i) => {
    const item = items[i];
    const top = floor - item.height * pxPerCm;
    // Altura: à direita da peça, com linhas de chamada tracejadas.
    const ax = box.x + box.w + 22;
    parts.push(`<line x1="${box.x + box.w / 2}" y1="${top}" x2="${ax + 8}" y2="${top}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
    parts.push(arrow(ax, top + 3, ax, floor - 3));
    parts.push(pill(ax, (top + floor) / 2 + 8, cm(item.height), 16));
    // Largura: abaixo da peça.
    const wy = floor + 26;
    // Seta na largura da peça como aparece na foto; o número é a medida real.
    const wpx = box.w;
    const cx = box.x + box.w / 2;
    parts.push(arrow(cx - wpx / 2 + 3, wy, cx + wpx / 2 - 3, wy));
    parts.push(`<text x="${cx}" y="${wy + 24}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${INK}">${cm(item.width)} de ${widthWord}</text>`);
    // Etiqueta com nome e preço.
    const label = `${item.name.toUpperCase()} · ${cm(item.height)}`;
    parts.push(pill(cx, wy + 66, label, 15));
    parts.push(`<text x="${cx}" y="${wy + 112}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="${INK}">R$&#160;${item.price}</text>`);
  });

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${INK}"/></marker></defs>
    ${parts.join("\n    ")}
  </svg>`;
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(output);
  console.log(`ok ${output} — ${boxes.map((box, i) => `${items[i].name}: ${box.w}×${box.h}px`).join(", ")}; ${pxPerCm.toFixed(1)} px/cm`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { detectBoxes, INK, LIGHT, FONT };
