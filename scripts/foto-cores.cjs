// Foto das opções de cor do Catálogo: etiqueta com o nome da cor embaixo de
// cada peça (da esquerda para a direita) e uma linha dizendo o que muda.
// Etiquetas escuras com texto claro — legíveis em qualquer fundo; a linha do que muda vai no topo.
//
//   node scripts/foto-cores.cjs <entrada> <saida.png> --cor Marrom --cor Bege [--titulo "Base e estrela: 2 cores · copa sempre verde"]
const sharp = require("sharp");
const { detectBoxes, INK, LIGHT, FONT } = require("./foto-tamanhos.cjs");

const WIDTH = 1024;
const HEIGHT = 768;
const args = process.argv.slice(2);
const [input, output] = args;
const colors = args.flatMap((value, i) => (args[i - 1] === "--cor" ? [value] : []));
const title = args.includes("--titulo") ? args[args.indexOf("--titulo") + 1] : "";

async function main() {
  if (!input || !output || !colors.length) {
    console.error('Uso: node scripts/foto-cores.cjs <entrada> <saida.png> --cor Marrom --cor Bege [--titulo "..."]');
    process.exit(1);
  }
  const base = await sharp(input).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
  const boxes = await detectBoxes(base, colors.length);
  const floor = Math.max(...boxes.map((box) => box.y + box.h));
  const parts = boxes.map((box, i) => {
    const cx = box.x + box.w / 2;
    const text = colors[i].toUpperCase();
    const width = text.length * 12 + 40;
    const y = Math.min(floor + 24, HEIGHT - 48);
    return `<rect x="${cx - width / 2}" y="${y}" width="${width}" height="36" rx="18" fill="${INK}"/>
      <text x="${cx}" y="${y + 24}" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="700" fill="${LIGHT}">${text}</text>`;
  });
  if (title) {
    const width = title.length * 10 + 44;
    parts.push(`<rect x="${(WIDTH - width) / 2}" y="22" width="${width}" height="34" rx="17" fill="${LIGHT}" fill-opacity="0.92" stroke="${INK}" stroke-width="1.5"/>
      <text x="${WIDTH / 2}" y="45" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="${INK}">${title}</text>`);
  }
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(output);
  console.log(`ok ${output} — ${boxes.map((box, i) => `${colors[i]} em x=${box.x}`).join(", ")}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
