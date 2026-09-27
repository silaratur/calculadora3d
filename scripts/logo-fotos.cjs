// Aplica o selo da AC3D (monograma vinho sobre círculo creme, canto inferior
// direito) nas fotos do Catálogo e grava em public/catalogo/ como WebP 4:3.
//
//   node scripts/logo-fotos.cjs capas            → capas <SKU>.webp (a partir de
//        public/Highsfield/capas-sem-logo/, criado na 1ª vez com as capas atuais)
//   node scripts/logo-fotos.cjs extras <pasta>   → <pasta>/<SKU>-<n>.png viram
//        public/catalogo/<SKU>-<n>.webp
//
// Sempre parte da imagem sem logo, então rodar de novo não duplica o selo.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "catalogo");
const RAW_COVERS = path.join(ROOT, "public", "Highsfield", "capas-sem-logo");
const MONOGRAM = path.join(ROOT, "public", "logo-ac3d-monograma.png");
const WIDTH = 1024; // 4:3 → 1024×768

async function badge(size) {
  const circle = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#f7f1e9" fill-opacity="0.92" stroke="#602f32" stroke-opacity="0.25" stroke-width="1.5"/></svg>`,
  );
  const mark = await sharp(MONOGRAM).resize(Math.round(size * 0.66), Math.round(size * 0.66), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp(circle).composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

async function withLogo(input, output) {
  const base = await sharp(input).resize(WIDTH, Math.round((WIDTH * 3) / 4), { fit: "cover" }).toBuffer();
  const size = Math.round(WIDTH * 0.1);
  const margin = Math.round(WIDTH * 0.025);
  const b = await badge(size);
  await sharp(base)
    .composite([{ input: b, left: WIDTH - size - margin, top: Math.round((WIDTH * 3) / 4) - size - margin }])
    .webp({ quality: 82 })
    .toFile(output);
}

(async () => {
  const [mode, dir] = process.argv.slice(2);
  if (mode === "capas") {
    if (!fs.existsSync(RAW_COVERS)) {
      fs.mkdirSync(RAW_COVERS, { recursive: true });
      for (const f of fs.readdirSync(OUT).filter((name) => /^[A-Z]\.\d{3}\.webp$/.test(name))) fs.copyFileSync(path.join(OUT, f), path.join(RAW_COVERS, f));
      console.log("capas originais guardadas em", RAW_COVERS);
    }
    for (const f of fs.readdirSync(RAW_COVERS).filter((name) => name.endsWith(".webp"))) {
      await withLogo(path.join(RAW_COVERS, f), path.join(OUT, f));
      console.log("capa", f);
    }
  } else if (mode === "extras" && dir) {
    for (const f of fs.readdirSync(dir).filter((name) => /^[A-Z]\.\d{3}-\d\.png$/.test(name)).sort()) {
      await withLogo(path.join(dir, f), path.join(OUT, f.replace(".png", ".webp")));
      console.log("extra", f);
    }
  } else {
    console.log("uso: node scripts/logo-fotos.cjs capas | extras <pasta>");
  }
})();
