// Foto de medidas do Catálogo: desenha as cotas (altura e largura) e uma régua
// em centímetros sobre a foto frontal da peça em fundo liso (a imagem 5 da
// revisão de marca). As medidas vêm do usuário — a IA só gera a foto base.
//
//   node scripts/foto-medidas.cjs <entrada> <saida.png> --altura 12 --largura 8.5 [--profundidade 6]
//        [--caixa x,y,w,h]   → contorno da peça em px, se a detecção automática errar
//
// A saída é PNG 1024×768 sem selo; depois passe por `logo-fotos.cjs extras` como as outras fotos.
const sharp = require("sharp");

const WIDTH = 1024;
const HEIGHT = 768;
const INK = "#602f32"; // vinho da marca
const LIGHT = "#fbf6ef"; // texto/traços sobre o vinho — régua clara em fundo claro some

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const cm = (value) => `${String(value).replace(".", ",")} cm`;

/** Contorno da peça: pixels que se afastam da cor dos cantos (fundo liso). */
async function detectBox(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const corners = [at(4, 4), at(info.width - 5, 4), at(4, info.height - 5), at(info.width - 5, info.height - 5)];
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, px) => sum + px[c], 0) / corners.length);
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 2) {
    for (let x = 0; x < info.width; x += 2) {
      const px = at(x, y);
      if (Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) > 60) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("Peça não encontrada — informe --caixa x,y,w,h");
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function label(x, y, text, anchor = "middle") {
  const width = text.length * 11 + 20;
  const left = anchor === "start" ? x : x - width / 2;
  return `<rect x="${left}" y="${y - 17}" width="${width}" height="28" rx="14" fill="${INK}"/>
    <text x="${left + width / 2}" y="${y + 3}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="${LIGHT}">${text}</text>`;
}

async function main() {
  const [input, output] = process.argv.slice(2);
  const altura = Number(String(arg("altura") ?? "").replace(",", "."));
  const largura = Number(String(arg("largura") ?? "").replace(",", "."));
  const profundidade = arg("profundidade");
  if (!input || !output || !(altura > 0) || !(largura > 0)) {
    console.error("Uso: node scripts/foto-medidas.cjs <entrada> <saida.png> --altura 12 --largura 8.5 [--profundidade 6] [--caixa x,y,w,h]");
    process.exit(1);
  }
  const base = await sharp(input).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
  const manual = arg("caixa")?.split(",").map(Number);
  const box = manual?.length === 4 ? { x: manual[0], y: manual[1], w: manual[2], h: manual[3] } : await detectBox(base);

  // Cota de altura à direita da peça; cota de largura e régua logo abaixo.
  const vx = Math.min(box.x + box.w + 34, WIDTH - 150);
  const hy = Math.min(box.y + box.h + 30, HEIGHT - 120);
  const ry = hy + 26; // topo da régua
  const pxPerCm = box.w / largura;
  const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="2.5" marker-start="url(#a)" marker-end="url(#a)"/>`;

  const ticks = [];
  const step = pxPerCm >= 40 ? 0.5 : 1; // meia em meia quando couber
  for (let v = 0; v <= largura + 1e-6; v += step) {
    const x = box.x + v * pxPerCm;
    const whole = Math.abs(v - Math.round(v)) < 1e-6;
    ticks.push(`<line x1="${x}" y1="${ry}" x2="${x}" y2="${ry + (whole ? 16 : 9)}" stroke="${LIGHT}" stroke-width="${whole ? 2 : 1.2}"/>`);
    const every = pxPerCm < 18 ? 5 : pxPerCm < 30 ? 2 : 1;
    if (whole && Math.round(v) % every === 0) ticks.push(`<text x="${x}" y="${ry + 32}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="${LIGHT}">${Math.round(v)}</text>`);
  }

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${INK}"/></marker></defs>
    <line x1="${box.x + box.w + 6}" y1="${box.y}" x2="${vx + 10}" y2="${box.y}" stroke="${INK}" stroke-opacity="0.45" stroke-dasharray="4 4"/>
    <line x1="${box.x + box.w + 6}" y1="${box.y + box.h}" x2="${vx + 10}" y2="${box.y + box.h}" stroke="${INK}" stroke-opacity="0.45" stroke-dasharray="4 4"/>
    ${arrow(vx, box.y + 4, vx, box.y + box.h - 4)}
    ${label(vx + 14, box.y + box.h / 2, cm(altura), "start")}
    ${arrow(box.x + 4, hy, box.x + box.w - 4, hy)}
    ${label(box.x + box.w / 2, hy - 2, cm(largura))}
    <rect x="${box.x - 8}" y="${ry - 4}" width="${box.w + 16}" height="44" rx="4" fill="${INK}"/>
    ${ticks.join("\n    ")}
    ${profundidade ? label(28, 36, `Profundidade ${cm(profundidade)}`, "start") : ""}
  </svg>`;

  await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(output);
  console.log(`ok ${output} — peça em x=${box.x} y=${box.y} ${box.w}×${box.h}px, ${pxPerCm.toFixed(1)} px/cm`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
