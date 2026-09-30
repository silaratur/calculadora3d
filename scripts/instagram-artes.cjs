// Gera as artes do Instagram (@ac3d_studio) a partir de uma pauta em JSON:
//
//   node scripts/instagram-artes.cjs scripts/instagram/<pauta>.json
//
// Carrossel = slides 4:5 (1080×1350); story = 9:16 (1080×1920). Nome, preço e
// cores vêm do Catálogo (banco), então a arte nunca sai com preço desatualizado.
// Fotos-base = recortes 4:3 sem texto em public/Highsfield/. A saída vai para
// public/Highsfield/instagram/<pauta>/<post>/ com a legenda em legenda.txt.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(__dirname, "..");
const PHOTOS = path.join(ROOT, "public", "Highsfield");
const FONTS = path.join(__dirname, "instagram", "fonts");
const LOGO = path.join(ROOT, "public", "logo-ac3d.png");
const LOGO_LIGHT = path.join(ROOT, "public", "logo-ac3d-claro.png");
const MONOGRAM = path.join(ROOT, "public", "logo-ac3d-monograma.png");

const C = { copper: "#602f32", copperDeep: "#4c2528", olive: "#777f5d", cream: "#f7f1e9", paper: "#fffdfb", ink: "#3d2225", muted: "#8a7472", border: "#e3cfc9", pink: "#f8dee7" };
const HANDLE = "@ac3d_studio";
const SITE = "ac3d.silaratur.cloud";
const W = 1080;

// Mesmo mapa de src/lib/filament-colors.ts (bolinhas iguais às da loja).
const SWATCHES = [
  [["branco", "branca", "off white"], "#f7f5f0"], [["preto", "preta"], "#232323"], [["vermelho", "vermelha"], "#c62828"],
  [["vinho", "bordo"], "#602f32"], [["rosa", "pink"], "#f2a7c3"], [["bege", "areia", "nude"], "#d8c3a5"],
  [["marrom", "madeira", "caramelo"], "#8a5a2e"], [["azul claro", "azul bebe"], "#9ccbf0"], [["azul"], "#2c5bd4"],
  [["verde oliva", "oliva"], "#777f5d"], [["verde"], "#2e8b57"], [["amarelo", "amarela"], "#f4c430"], [["laranja"], "#f08a24"],
  [["roxo", "roxa", "lilas"], "#8e6bbf"], [["cinza", "grafite"], "#8d8d8d"], [["dourado", "dourada"], "#c9a24a"], [["prata"], "#c0c0c0"],
];
const normalize = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const swatch = (color) => {
  const name = normalize(color);
  for (const [names, hex] of SWATCHES) if (names.some((item) => name === item || name.startsWith(item))) return hex;
  return "#b9a7a3";
};

const money = (value) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FACES = {
  400: ["Plus Jakarta Sans", "normal", "jakarta-400.ttf"],
  500: ["Plus Jakarta Sans", "medium", "jakarta-500.ttf"],
  700: ["Plus Jakarta Sans", "bold", "jakarta-700.ttf"],
  800: ["Plus Jakarta Sans", "ultrabold", "jakarta-800.ttf"],
  mono: ["JetBrains Mono", "semibold", "mono-600.ttf"],
  // Só nos stories explicativos: título serifado, destaque em itálico e letra de mão.
  serif: ["Fraunces", "ultrabold", "fraunces-800-normal.ttf"],
  serifItalic: ["Fraunces", "semibold", "fraunces-600-italic.ttf", "italic"],
  hand: ["Caveat", "bold", "caveat-700-normal.ttf"],
};

/** Texto → PNG transparente. size em px; width opcional quebra linha. */
async function text(content, { size, weight = 400, color = C.ink, width, spacing = 0, align = "left", lineHeight = 1.15 }) {
  const [family, fw, file, style] = FACES[weight];
  const markup = `<span foreground="${color}" font_weight="${fw}"${style ? ` font_style="${style}"` : ""}${spacing ? ` letter_spacing="${Math.round(spacing * size * 1024)}"` : ""}>${esc(content)}</span>`;
  const { data, info } = await sharp({
    text: { text: markup, font: `${family} ${size}`, fontfile: path.join(FONTS, file), rgba: true, dpi: 72, width, align, spacing: Math.round(size * (lineHeight - 1)), wrap: "word" },
  }).png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

async function roundedPhoto(file, width, height, radius) {
  const photo = await sharp(path.join(PHOTOS, file)).resize(width, height, { fit: "cover" }).toBuffer();
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`);
  return sharp(photo).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const logo = (file, height) => sharp(file).resize({ height }).png().toBuffer();

function dots(colors, size = 34, gap = 12) {
  const n = Math.min(colors.length, 8);
  const width = n * size + (n - 1) * gap;
  const circles = colors.slice(0, 8).map((color, i) => `<circle cx="${i * (size + gap) + size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="${swatch(color)}" stroke="${C.ink}" stroke-opacity="0.18" stroke-width="2"/>`);
  return { input: Buffer.from(`<svg width="${width}" height="${size}">${circles.join("")}</svg>`), width, height: size };
}

function pill(label, { width, height, fill, stroke }) {
  return Buffer.from(`<svg width="${width}" height="${height}"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${height / 2}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ""}/></svg>`);
}

const canvas = (height, background = C.cream) => ({ create: { width: W, height, channels: 4, background } });

// Rodapé comum aos slides claros: linha fina, @ à esquerda, logo à direita.
async function footer(layers, top) {
  layers.push({ input: Buffer.from(`<svg width="${W - 80}" height="2"><rect width="${W - 80}" height="2" fill="${C.border}"/></svg>`), left: 40, top });
  const handle = await text(HANDLE, { size: 28, weight: 700, color: C.copper });
  layers.push({ input: handle.input, left: 40, top: top + 22 });
  const mark = await logo(MONOGRAM, 44);
  const brand = await text("AC3D STUDIO", { size: 22, weight: 700, color: C.copper, spacing: 0.12 });
  layers.push({ input: brand.input, left: W - 40 - brand.width, top: top + 30 });
  layers.push({ input: mark, left: W - 40 - brand.width - 56, top: top + 18 });
}

async function productSlide(slide, product, index, total) {
  const label = await text((slide.label || product.category).toUpperCase(), { size: 24, weight: 700, color: C.olive, spacing: 0.12 });
  const name = await text(slide.name || product.name, { size: 54, weight: 800, color: C.ink, width: 1000, lineHeight: 1.05 });
  const line = slide.line ? await text(slide.line, { size: 30, weight: 400, color: C.muted, width: 1000 }) : null;
  // Preço e cores presos à base, acima do rodapé; a foto ocupa o que sobrar.
  const priceTop = 1150;
  const block = label.height + 14 + name.height + (line ? 16 + line.height : 0);
  const photoH = Math.max(700, Math.min(900, priceTop - 32 - block - 40 - 40));
  const layers = [{ input: await roundedPhoto(slide.photo, 1000, photoH, 28), left: 40, top: 40 }];
  if (total) {
    const counter = await text(`${index}/${total}`, { size: 22, weight: "mono", color: C.copper });
    layers.push({ input: pill("", { width: counter.width + 36, height: 44, fill: C.paper }), left: W - 60 - counter.width - 36, top: 60 });
    layers.push({ input: counter.input, left: W - 60 - counter.width - 18, top: 70 });
  }
  let y = 40 + photoH + 40;
  layers.push({ input: label.input, left: 40, top: y });
  y += label.height + 14;
  layers.push({ input: name.input, left: 40, top: y });
  y += name.height + 16;
  if (line) layers.push({ input: line.input, left: 40, top: y });
  let x = 40;
  if (slide.priceFrom) {
    const from = await text("a partir de", { size: 26, weight: 500, color: C.muted });
    layers.push({ input: from.input, left: x, top: priceTop + 22 });
    x += from.width + 14;
  }
  const price = await text(money(product.price), { size: 56, weight: "mono", color: C.copper });
  layers.push({ input: price.input, left: x, top: priceTop });
  const colors = slide.colors || JSON.parse(product.colors || "[]");
  if (colors.length > 1) {
    const d = dots(colors);
    const caption = await text(`${colors.length} cores`, { size: 22, weight: 500, color: C.muted });
    layers.push({ input: d.input, left: W - 40 - d.width, top: priceTop + 4 });
    layers.push({ input: caption.input, left: W - 40 - caption.width, top: priceTop + 48 });
  }
  await footer(layers, 1248);
  return sharp(canvas(1350)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

async function coverSlide(slide) {
  const layers = [];
  const mark = await logo(MONOGRAM, 72);
  layers.push({ input: mark, left: 40, top: 48 });
  const brand = await text("AC3D STUDIO", { size: 24, weight: 700, color: C.copper, spacing: 0.14 });
  layers.push({ input: brand.input, left: 128, top: 72 });
  let y = 170;
  const label = await text(slide.label.toUpperCase(), { size: 26, weight: 700, color: C.olive, spacing: 0.14 });
  layers.push({ input: label.input, left: 40, top: y });
  y += label.height + 18;
  const title = await text(slide.title, { size: 88, weight: 800, color: C.ink, width: 1000, lineHeight: 1.0 });
  layers.push({ input: title.input, left: 40, top: y });
  y += title.height + 20;
  if (slide.subtitle) {
    const sub = await text(slide.subtitle, { size: 32, weight: 400, color: C.muted, width: 1000 });
    layers.push({ input: sub.input, left: 40, top: y });
  }
  layers.push({ input: await roundedPhoto(slide.photo, 1000, 750, 28), left: 40, top: 560 });
  const swipe = await text("Arraste  →", { size: 26, weight: 700, color: C.cream });
  layers.push({ input: pill("", { width: swipe.width + 56, height: 60, fill: C.copper }), left: W - 60 - swipe.width - 56, top: 1310 - 80 });
  layers.push({ input: swipe.input, left: W - 60 - swipe.width - 28, top: 1310 - 80 + 15 });
  return sharp(canvas(1350)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

// Fundo vinho com os passos do pedido; o bloco inteiro fica centralizado na altura.
async function ctaSlide(slide, height = 1350) {
  const layers = [];
  const markH = height > 1400 ? 300 : 230;
  const mark = await logo(LOGO_LIGHT, markH);
  const markWidth = (await sharp(mark).metadata()).width;
  let y = 0;
  layers.push({ input: mark, left: Math.round((W - markWidth) / 2), top: y });
  y += markH + 60;
  const title = await text(slide.heading || "Como pedir", { size: 64, weight: 800, color: C.cream, width: 1000, align: "centre" });
  layers.push({ input: title.input, left: Math.round((W - title.width) / 2), top: y });
  y += title.height + 44;
  const steps = slide.steps || ["Toque no link da bio", "Escolha a peça e a cor", "Peça seu orçamento pela loja"];
  for (const [i, step] of steps.entries()) {
    const num = await text(String(i + 1), { size: 30, weight: "mono", color: C.copper });
    layers.push({ input: Buffer.from(`<svg width="64" height="64"><circle cx="32" cy="32" r="31" fill="${C.cream}"/></svg>`), left: 150, top: y });
    layers.push({ input: num.input, left: 150 + Math.round((64 - num.width) / 2), top: y + Math.round((64 - num.height) / 2) });
    const label = await text(step, { size: 36, weight: 500, color: C.cream, width: 740 });
    layers.push({ input: label.input, left: 240, top: y + Math.round((64 - label.height) / 2) });
    y += 96;
  }
  if (slide.note) {
    const note = await text(slide.note, { size: 28, weight: 400, color: C.pink, width: 900, align: "centre" });
    layers.push({ input: note.input, left: Math.round((W - note.width) / 2), top: y + 16 });
    y += 16 + note.height;
  }
  y += 72;
  const site = await text(SITE, { size: 30, weight: "mono", color: C.copper });
  const pillW = site.width + 80;
  layers.push({ input: pill("", { width: pillW, height: 76, fill: C.cream }), left: Math.round((W - pillW) / 2), top: y });
  layers.push({ input: site.input, left: Math.round((W - site.width) / 2), top: y + Math.round((76 - site.height) / 2) });
  const handle = await text(HANDLE, { size: 30, weight: 700, color: C.cream });
  layers.push({ input: handle.input, left: Math.round((W - handle.width) / 2), top: y + 100 });
  y += 100 + handle.height;
  const offset = Math.round((height - y) / 2);
  for (const layer of layers) layer.top += offset;
  return sharp(canvas(height, C.copper)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

// Story: zonas seguras do Instagram — nada importante nos 250px de cima e de baixo.
async function storySlide(story, product) {
  const layers = [];
  const mark = await logo(MONOGRAM, 64);
  layers.push({ input: mark, left: 40, top: 250 });
  const brand = await text("AC3D STUDIO", { size: 24, weight: 700, color: C.copper, spacing: 0.14 });
  layers.push({ input: brand.input, left: 120, top: 270 });
  let y = 360;
  const label = await text((story.label || product.category).toUpperCase(), { size: 26, weight: 700, color: C.olive, spacing: 0.14 });
  layers.push({ input: label.input, left: 40, top: y });
  y += label.height + 16;
  const name = await text(story.name || product.name, { size: 64, weight: 800, color: C.ink, width: 1000, lineHeight: 1.02 });
  layers.push({ input: name.input, left: 40, top: y });
  y += name.height + 36;
  const line = story.line ? await text(story.line, { size: 32, weight: 400, color: C.muted, width: 1000 }) : null;
  const price = await text(money(product.price), { size: 60, weight: "mono", color: C.copper });
  const ctaTop = 1920 - 250 - 88 - 40;
  const photoH = Math.max(700, Math.min(1000, ctaTop - 56 - price.height - (line ? line.height + 28 : 0) - 36 - y));
  layers.push({ input: await roundedPhoto(story.photo, 1000, photoH, 32), left: 40, top: y });
  y += photoH + 36;
  if (line) {
    layers.push({ input: line.input, left: 40, top: y });
    y += line.height + 28;
  }
  layers.push({ input: price.input, left: 40, top: y });
  const colors = story.colors || JSON.parse(product.colors || "[]");
  if (colors.length > 1) {
    const d = dots(colors, 36);
    layers.push({ input: d.input, left: W - 40 - d.width, top: y + 12 });
  }
  const cta = await text(story.cta || "Peça pelo link da bio", { size: 32, weight: 700, color: C.cream });
  const ctaW = cta.width + 96;
  layers.push({ input: pill("", { width: ctaW, height: 88, fill: C.copper }), left: Math.round((W - ctaW) / 2), top: 1920 - 250 - 88 - 40 });
  layers.push({ input: cta.input, left: Math.round((W - cta.width) / 2), top: 1920 - 250 - 88 - 40 + Math.round((88 - cta.height) / 2) });
  const handle = await text(HANDLE, { size: 28, weight: 700, color: C.copper });
  layers.push({ input: handle.input, left: Math.round((W - handle.width) / 2), top: 1920 - 250 + 10 });
  return sharp(canvas(1920)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

// ─── Story explicativo ────────────────────────────────────────────────────────
// Produto em destaque + para que serve, benefícios com ícone, cores com nome,
// tamanho, selo de gatilho e chamada para o direct. Os rabiscos (sublinhado,
// seta, coração) são traçados com um leve tremor para parecerem feitos à mão.

// Ícones de traço (Lucide, ISC), viewBox 24.
const ICONS = {
  casa: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  coracao: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  presente: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  estrela: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  sorriso: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  mesa: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  mao: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  livro: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  vela: '<path d="M12 2c1 2 2 3 2 4.5a2 2 0 0 1-4 0C10 5 11 4 12 2Z"/><rect x="8" y="10" width="8" height="12" rx="1"/>',
  folha: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  regua: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  paleta: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  carro: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
const icon = (name, size, color, stroke = 2) =>
  Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.estrela}</svg>`);

function random(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (text) => [...text].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7);

/** Traço "de caneta": amostra a curva e treme cada ponto; desenha duas passadas. */
function handStroke(curve, { rand, steps = 28, amp = 1.4, width = 5, color }) {
  const pass = (jitter, opacity, w) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const [x, y] = curve(i / steps);
      pts.push(`${(x + (rand() - 0.5) * jitter).toFixed(1)} ${(y + (rand() - 0.5) * jitter).toFixed(1)}`);
    }
    return `<path d="M${pts.join(" L")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  };
  return pass(amp, 1, width) + pass(amp * 1.6, 0.35, width * 0.6);
}

const doodle = {
  swash(w, color, rand) {
    const h = 30;
    return { input: Buffer.from(`<svg width="${w}" height="${h}">${handStroke((t) => [8 + t * (w - 16), 18 - Math.sin(t * Math.PI) * 10 + t * 4], { rand, color, width: 5 })}</svg>`), width: w, height: h };
  },
  heart(size, color, rand) {
    const s = size / 36;
    const curve = (t) => {
      const a = Math.PI * 2 * (t * 0.94 + 0.03);
      return [size / 2 + 16 * Math.sin(a) ** 3 * s, size / 2.2 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s];
    };
    return { input: Buffer.from(`<svg width="${size}" height="${size}">${handStroke(curve, { rand, color, width: 4, steps: 40, amp: 1 })}</svg>`), width: size, height: size };
  },
  // Seta curva de (x1,y1) até (x2,y2) dentro de uma caixa w×h, com ponta aberta.
  arrow(w, h, [x1, y1], [x2, y2], bend, color, rand) {
    const cx = (x1 + x2) / 2 + bend[0];
    const cy = (y1 + y2) / 2 + bend[1];
    const curve = (t) => [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2];
    const angle = Math.atan2(y2 - cy, x2 - cx);
    const head = (da) => {
      const a = angle + Math.PI + da;
      return handStroke((t) => [x2 + Math.cos(a) * 26 * t, y2 + Math.sin(a) * 26 * t], { rand, color, width: 4.5, steps: 6, amp: 0.8 });
    };
    return { input: Buffer.from(`<svg width="${w}" height="${h}">${handStroke(curve, { rand, color, width: 4.5 })}${head(0.5)}${head(-0.5)}</svg>`), width: w, height: h };
  },
  // Risquinhos de ênfase (como "\ | /" ao lado de um botão).
  ticks(side, color, rand) {
    const lines = [-0.8, 0, 0.8].map((a) => {
      const ang = (side === "left" ? Math.PI : 0) + a;
      return handStroke((t) => [50 + Math.cos(ang) * (22 + 22 * t), 40 + Math.sin(ang) * (22 + 22 * t)], { rand, color, width: 4, steps: 5, amp: 0.6 });
    });
    return { input: Buffer.from(`<svg width="60" height="80">${lines.join("")}</svg>`), width: 60, height: 80 };
  },
};

async function rotated(layer, degrees) {
  const { data, info } = await sharp(layer.input).rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** Foto de ponta a ponta no topo, dissolvendo no fundo embaixo. */
async function fadedPhoto(file, width, height) {
  const photo = await sharp(path.join(PHOTOS, file)).resize(width, height, { fit: "cover" }).toBuffer();
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.68" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/></svg>`);
  return sharp(photo).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function shadedSwatch(color, size) {
  return Buffer.from(`<svg width="${size}" height="${size}"><defs><radialGradient id="s" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${swatch(color)}"/><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="url(#s)" stroke="#3d2225" stroke-opacity=".15" stroke-width="2"/></svg>`);
}

const THEMES = {
  creme: { bg: C.cream, ink: C.ink, muted: C.muted, label: C.olive, accent: C.copper, border: C.border, logo: MONOGRAM, cta: C.copper, ctaText: C.cream, price: C.copper, doodle: C.copper, sticker: C.copper, stickerText: C.cream },
  vinho: { bg: C.copperDeep, ink: C.cream, muted: "#d9c4c0", label: "#b7bf98", accent: C.pink, border: "#7a4a4d", logo: path.join(ROOT, "public", "logo-ac3d-monograma-claro.png"), cta: C.cream, ctaText: C.copper, price: C.cream, doodle: C.pink, sticker: C.cream, stickerText: C.copper },
};
const shortColor = (color) => color.replace(/\s+caucasiano/i, "");

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** Sombra difusa de um PNG (texto ou traço), para ler sobre qualquer foto. */
async function softShadow(buffer, pad = 20, blur = 7) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 20;
  return sharp(data, { raw: info }).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(blur).png().toBuffer();
}

/** Selo da marca: monograma vinho sobre círculo creme (o mesmo das fotos do Catálogo). */
async function brandSeal(size) {
  const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${C.cream}" fill-opacity="0.95" stroke="${C.copper}" stroke-opacity="0.25" stroke-width="2"/></svg>`);
  const mark = await sharp(MONOGRAM).resize(Math.round(size * 0.64), Math.round(size * 0.64), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp(circle).composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

// Story explicativo: a foto conta o uso; a letra de mão comenta; o selo cria urgência.
async function storyRich(story, product) {
  const T = THEMES[story.theme];
  const rand = random(seedOf(story.id || product.sku));
  const H = 1920;
  const block = []; // conteúdo abaixo da foto, com top relativo ao início do bloco
  const center = (layer) => Math.round((W - layer.width) / 2);
  let y = 0;

  const label = await text(story.label.toUpperCase(), { size: 24, weight: 700, color: T.label, spacing: 0.16 });
  block.push({ ...label, left: center(label), top: y });
  y += label.height + 16;
  const title = await text(story.headline, { size: 86, weight: 800, color: T.ink, width: 1000, align: "centre", lineHeight: 1.0 });
  block.push({ ...title, left: center(title), top: y });
  y += title.height + 6;
  if (story.accent) {
    const accent = await rotated(await text(story.accent, { size: 60, weight: "hand", color: T.accent }), -3);
    const heart = doodle.heart(48, T.doodle, rand);
    const left = Math.round((W - accent.width - 12 - heart.width) / 2);
    block.push({ ...accent, left, top: y });
    block.push({ ...heart, left: left + accent.width + 12, top: y + Math.round((accent.height - heart.height) / 2) });
    y += accent.height - 8;
    const swash = doodle.swash(Math.min(560, accent.width + 40), T.doodle, rand);
    block.push({ ...swash, left: center(swash), top: y });
    y += swash.height;
  }
  y += 34;

  // Cores numa linha só, com o convite escrito à mão e uma setinha.
  const colors = story.colors || JSON.parse(product.colors || "[]");
  if (colors.length > 1) {
    const invite = await text(story.colorsNote || "escolha a sua cor", { size: 40, weight: "hand", color: T.accent });
    const dot = colors.length > 5 ? 56 : 64;
    const cell = colors.length > 6 ? 118 : 150;
    const rowW = cell * colors.length;
    const rowLeft = Math.round((W - rowW) / 2);
    const inviteLeft = Math.max(40, rowLeft - 10);
    block.push({ ...invite, left: inviteLeft, top: y });
    const arrow = doodle.arrow(90, 70, [8, 22], [70, 62], [18, -18], T.doodle, rand);
    block.push({ ...arrow, left: inviteLeft + invite.width + 8, top: y + 4 });
    y += invite.height + 18;
    for (const [i, color] of colors.entries()) {
      const cx = rowLeft + i * cell;
      block.push({ input: shadedSwatch(color, dot), left: cx + Math.round((cell - dot) / 2), top: y });
      const name = await text(shortColor(color), { size: 21, weight: 500, color: T.ink });
      block.push({ ...name, left: cx + Math.round((cell - name.width) / 2), top: y + dot + 8 });
    }
    y += dot + 44;
  }
  if (story.size) {
    const size = await text(story.size, { size: 26, weight: 700, color: T.ink });
    const chipW = size.width + 96;
    const left = center({ width: chipW });
    block.push({ input: pill("", { width: chipW, height: 58, fill: "none", stroke: T.border }), left, top: y });
    block.push({ input: icon("regua", 30, T.accent), left: left + 26, top: y + 14 });
    block.push({ ...size, left: left + 70, top: y + Math.round((58 - size.height) / 2) });
    y += 58;
  }
  y += 36;

  // Preço sublinhado à mão.
  if (story.priceFrom) {
    const from = await text("a partir de", { size: 36, weight: "hand", color: T.accent });
    block.push({ ...from, left: center(from), top: y });
    y += from.height - 6;
  }
  const price = await text(money(product.price), { size: 66, weight: "mono", color: T.price });
  block.push({ ...price, left: center(price), top: y });
  y += price.height;
  const under = doodle.swash(price.width + 40, T.doodle, rand);
  block.push({ ...under, left: center(under), top: y - 4 });
  y += under.height + 26;

  // Urgência honesta: produção sob encomenda, por ordem de pedido.
  if (story.fomoLine) {
    const fomo = await text(story.fomoLine.toUpperCase(), { size: 21, weight: 700, color: T.label, spacing: 0.14 });
    block.push({ ...fomo, left: center(fomo), top: y });
    y += fomo.height + 18;
  }

  // Chamada para a bio, com risquinhos de ênfase dos dois lados.
  const line1 = await text("CONSULTE O LINK DA BIO", { size: 27, weight: 800, color: T.ctaText, spacing: 0.08 });
  const line2 = await text("e peça seu orçamento", { size: 25, weight: 500, color: T.ctaText });
  const ctaW = Math.max(line1.width, line2.width) + 170;
  const ctaH = 108;
  const ctaLeft = center({ width: ctaW });
  block.push({ input: pill("", { width: ctaW, height: ctaH, fill: T.cta }), left: ctaLeft, top: y });
  block.push({ input: icon("link", 40, T.ctaText, 2.2), left: ctaLeft + 44, top: y + 34 });
  const th = line1.height + 10 + line2.height;
  block.push({ ...line1, left: ctaLeft + 110, top: y + Math.round((ctaH - th) / 2) });
  block.push({ ...line2, left: ctaLeft + 110, top: y + Math.round((ctaH - th) / 2) + line1.height + 10 });
  const tl = doodle.ticks("left", T.doodle, rand);
  const tr = doodle.ticks("right", T.doodle, rand);
  block.push({ ...tl, left: ctaLeft - 62, top: y + 14 });
  block.push({ ...tr, left: ctaLeft + ctaW + 2, top: y + 14 });
  y += ctaH + 34;

  // Assinatura: monograma + AC3D STUDIO + @.
  const mark = await logo(T.logo, 54);
  const markW = (await sharp(mark).metadata()).width;
  const brand = await text("AC3D STUDIO", { size: 22, weight: 700, color: T.ink, spacing: 0.16 });
  const at = await text(`·  ${HANDLE}`, { size: 22, weight: 500, color: T.muted });
  const sigW = markW + 14 + brand.width + 14 + at.width;
  const sigLeft = center({ width: sigW });
  block.push({ input: mark, left: sigLeft, top: y });
  block.push({ ...brand, left: sigLeft + markW + 14, top: y + Math.round((54 - brand.height) / 2) });
  block.push({ ...at, left: sigLeft + markW + 14 + brand.width + 14, top: y + Math.round((54 - at.height) / 2) });
  y += 54;

  // A foto ganha todo o espaço que sobrar acima; o bloco termina antes da barra de resposta.
  const bottomLimit = H - 170;
  const overlap = 80;
  const photoH = Math.max(640, Math.min(1060, bottomLimit - y + overlap));
  const blockTop = photoH - overlap;
  const layers = [{ input: await fadedPhoto(story.photo, W, photoH), left: 0, top: 0 }];

  // Selo da marca no canto, abaixo do cabeçalho do Instagram.
  layers.push({ input: await brandSeal(118), left: 40, top: 236 });

  // Selo de urgência: contagem regressiva até a data, ou uma frase curta.
  const d = 236;
  let stamp;
  if (story.countdown) {
    const days = daysBetween(story.countdown.from, story.countdown.to);
    const top = await text("faltam", { size: 38, weight: "hand", color: T.stickerText });
    const num = await text(String(days), { size: 78, weight: "mono", color: T.stickerText });
    const bottom = await text(`dias p/ ${story.countdown.name}`, { size: 34, weight: "hand", color: T.stickerText, width: 190, align: "centre", lineHeight: 0.9 });
    const total = top.height + num.height + bottom.height + 14;
    let sy = Math.round((d - total) / 2);
    const parts = [];
    for (const [layer, gap] of [[top, 6], [num, 8], [bottom, 0]]) {
      parts.push({ input: layer.input, left: Math.round((d - layer.width) / 2), top: sy });
      sy += layer.height + gap;
    }
    stamp = parts;
  } else if (story.sticker) {
    const words = await text(story.sticker, { size: 42, weight: "hand", color: T.stickerText, width: 170, align: "centre", lineHeight: 0.9 });
    stamp = [{ input: words.input, left: Math.round((d - words.width) / 2), top: Math.round((d - words.height) / 2) }];
  }
  if (stamp) {
    const disc = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="${T.sticker}"/><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 15}" fill="none" stroke="${T.stickerText}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="7 7"/></svg>`);
    const tilted = await rotated({ input: await sharp(disc).composite(stamp).png().toBuffer() }, 8);
    const shadow = await softShadow(tilted.input, 24, 12);
    // Desce até a divisa foto/fundo, a não ser que o título seja largo e esbarre nele.
    const clear = (W + title.width) / 2 + 20 < W - tilted.width - 36;
    const top = Math.max(300, blockTop - (clear ? Math.round(tilted.height * 0.62) : tilted.height + 20));
    layers.push({ input: shadow, left: W - tilted.width - 36 - 24 + 4, top: top - 24 + 8 });
    layers.push({ input: tilted.input, left: W - tilted.width - 36, top });
  }

  // Comentário à mão sobre a foto, com seta apontando para o produto.
  if (story.note) {
    const note = await rotated(await text(story.note, { size: 50, weight: "hand", color: C.cream, width: 440, lineHeight: 0.95 }), -5);
    const noteTop = Math.max(420, blockTop - note.height - 110);
    const shadow = await softShadow(note.input);
    layers.push({ input: shadow, left: 40 - 20 + 2, top: noteTop - 20 + 3 });
    layers.push({ input: shadow, left: 40 - 20 + 2, top: noteTop - 20 + 3 });
    layers.push({ ...note, left: 40, top: noteTop });
    const [tx, ty] = story.noteTarget || [0.4, 0.45];
    const from = [40 + Math.min(note.width, 300) * 0.55, noteTop - 12];
    const to = [W * tx, photoH * ty];
    const arrow = doodle.arrow(W, photoH, from, to, [-60, 20], C.cream, random(seedOf(story.id) + 1));
    const dark = doodle.arrow(W, photoH, from, to, [-60, 20], "#141010", random(seedOf(story.id) + 1));
    layers.push({ input: await sharp(dark.input).blur(5).png().toBuffer(), left: 0, top: 3 });
    layers.push({ input: arrow.input, left: 0, top: 0 });
  }

  for (const layer of block) layers.push({ input: layer.input, left: layer.left, top: layer.top + blockTop });
  return sharp(canvas(H, T.bg)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

// ─── Story cheio (estilo anúncio) ─────────────────────────────────────────────
// Foto de cena vertical ocupando a tela toda; por cima: logo, etiqueta, título
// com palavra manuscrita sobre pincelada, ícones de uso, recado à mão, selo de
// produção limitada, cartões de cenário, preço/combos e botão para o link da bio.
const FULL = {
  creme: { base: [247, 241, 233], ink: C.ink, muted: C.muted, accent: C.copper, label: C.olive, brush: "#ead9c6", panel: C.paper, panelInk: C.ink, card: C.copper, cardInk: C.cream, logo: LOGO, tag: C.copper, tagInk: C.cream, cta: "#5f6549", ctaInk: C.cream, doodle: C.copper, sticker: C.copper, stickerInk: C.cream },
  vinho: { base: [76, 37, 40], ink: C.cream, muted: "#e3cfc9", accent: "#f3c9a8", label: "#c9d0ab", brush: "#7a3b3f", panel: C.cream, panelInk: C.ink, card: C.cream, cardInk: C.copper, logo: LOGO_LIGHT, tag: C.cream, tagInk: C.copper, cta: C.cream, ctaInk: C.copper, doodle: "#f3c9a8", sticker: C.cream, stickerInk: C.copper },
};
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

/** Pincelada de tinta irregular (atrás de palavra ou preço). */
function brush(width, height, color, rand) {
  const top = [];
  const bottom = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const x = 14 + (i / n) * (width - 28);
    top.push([x, height * 0.16 + (rand() - 0.5) * height * 0.18]);
    bottom.push([x, height * 0.86 + (rand() - 0.5) * height * 0.16]);
  }
  const pts = [[2, height * 0.55], ...top, [width - 2, height * 0.42], ...bottom.reverse()];
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} Z`;
  const streaks = [0.35, 0.6].map((f) => `<path d="M${width * 0.08} ${height * f} Q ${width / 2} ${height * f + (rand() - 0.5) * 8} ${width * 0.9} ${height * f}" stroke="#fff" stroke-opacity=".12" stroke-width="3" fill="none"/>`);
  return Buffer.from(`<svg width="${width}" height="${height}"><path d="${d}" fill="${color}"/>${streaks.join("")}</svg>`);
}

function ornament(width, color) {
  const mid = width / 2;
  return Buffer.from(`<svg width="${width}" height="16"><line x1="0" y1="8" x2="${mid - 14}" y2="8" stroke="${color}" stroke-width="2"/><rect x="${mid - 5}" y="3" width="10" height="10" transform="rotate(45 ${mid} 8)" fill="${color}"/><line x1="${mid + 14}" y1="8" x2="${width}" y2="8" stroke="${color}" stroke-width="2"/></svg>`);
}

async function storyFull(story, product, products) {
  const T = FULL[story.theme];
  const rand = random(seedOf(story.id || product.sku));
  const H = 1920;
  const layers = [];

  // Fundo: cena vertical (com ajuste opcional de escala/deslocamento) + véus de cor.
  const scale = story.bgScale || 1;
  const bgW = Math.round(W * scale);
  const bgH = Math.round(H * scale);
  const scaled = await sharp(path.join(PHOTOS, story.background)).resize(bgW, bgH, { fit: "cover" }).toBuffer();
  const bg = await sharp(scaled).extract({ left: Math.max(0, Math.min(bgW - W, Math.round((bgW - W) / 2) + (story.bgDx || 0))), top: Math.max(0, Math.min(bgH - H, Math.round((bgH - H) / 2) + (story.bgShift || 0))), width: W, height: H }).toBuffer();
  layers.push({ input: bg, left: 0, top: 0 });
  // Os véus param antes da caixa do produto (story.productBox = [x0, y0, x1, y1] na arte final).
  const box = story.productBox;
  if (!box) throw new Error(`${story.id}: defina productBox (onde o produto aparece) — o produto nunca pode ser coberto`);
  const vt = (box[1] - 10) / H;
  const vb = (box[3] + 10) / H;
  const veil = Buffer.from(`<svg width="${W}" height="${H}"><defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgba(T.base, 0.96)}"/><stop offset="${vt - 0.1}" stop-color="${rgba(T.base, 0.9)}"/><stop offset="${vt - 0.04}" stop-color="${rgba(T.base, 0.6)}"/><stop offset="${vt}" stop-color="${rgba(T.base, 0)}"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="${vb}" stop-color="${rgba(T.base, 0)}"/><stop offset="${vb + 0.05}" stop-color="${rgba(T.base, 0.8)}"/><stop offset="${vb + 0.1}" stop-color="${rgba(T.base, 0.95)}"/><stop offset="1" stop-color="${rgba(T.base, 0.98)}"/></linearGradient>
  </defs><rect width="${W}" height="${H}" fill="url(#t)"/><rect width="${W}" height="${H}" fill="url(#b)"/></svg>`);
  layers.push({ input: veil, left: 0, top: 0 });
  const fixed = layers.length; // fundo e véus não entram na verificação

  // Logo + etiqueta.
  const logoH = 132;
  const lg = await logo(T.logo, logoH);
  layers.push({ input: lg, left: 44, top: 214 });
  if (story.tag) {
    const tag = await text(story.tag.toUpperCase(), { size: 24, weight: 800, color: T.tagInk, spacing: 0.14 });
    const tw = tag.width + 56;
    layers.push({ input: pill("", { width: tw, height: 58, fill: T.tag }), left: W - 44 - tw, top: 250 });
    layers.push({ ...tag, left: W - 44 - tw + 28, top: 250 + Math.round((58 - tag.height) / 2) });
  }

  // Título: linha forte + palavra manuscrita sobre pincelada + linha de apoio.
  let y = 372;
  const head = await text(story.headline, { size: 92, weight: 800, color: T.ink, width: 1000, lineHeight: 0.98 });
  layers.push({ ...head, left: 44, top: y });
  y += head.height - 6;
  const script = await rotated(await text(story.script, { size: 118, weight: "hand", color: T.accent }), -2);
  const br = brush(script.width + 50, Math.round(script.height * 0.62), T.brush, rand);
  layers.push({ input: br, left: 26, top: y + Math.round(script.height * 0.3) });
  layers.push({ ...script, left: 44, top: y });
  y += script.height + 16;
  if (story.subline) {
    const sub = await text(story.subline.toUpperCase(), { size: 22, weight: 700, color: T.label, spacing: 0.16, width: 640 });
    layers.push({ ...sub, left: 46, top: y });
    y += sub.height + 14;
    layers.push({ input: ornament(360, T.label), left: 46, top: y });
  }

  // Coluna de ícones de uso, à direita, com rótulo em plaquinha clara.
  let iy = 690;
  for (const item of story.uses || []) {
    const d = 88;
    layers.push({ input: Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 2}" fill="${C.paper}" fill-opacity=".9" stroke="${C.copper}" stroke-width="2.5"/></svg>`), left: W - 44 - 170 + Math.round((170 - d) / 2), top: iy });
    layers.push({ input: icon(item.icon, 44, C.copper, 1.8), left: W - 44 - 170 + Math.round((170 - 44) / 2), top: iy + 22 });
    const lab = await text(item.label, { size: 21, weight: 700, color: C.ink, width: 160, align: "centre", lineHeight: 1.05 });
    const pw = 176;
    const ph = lab.height + 18;
    layers.push({ input: Buffer.from(`<svg width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="12" fill="${C.paper}" fill-opacity=".9"/></svg>`), left: W - 44 - 170 - 3, top: iy + d + 8 });
    layers.push({ ...lab, left: W - 44 - 170 - 3 + Math.round((pw - lab.width) / 2), top: iy + d + 17 });
    iy += d + ph + 20;
  }

  // Recado à mão com seta para o produto.
  if (story.note) {
    // Recado na faixa livre da esquerda, sem cobrir o produto.
    const note = await rotated(await text(story.note, { size: story.noteSize || 44, weight: "hand", color: C.cream, width: story.noteWidth || 270, lineHeight: 0.95 }), -6);
    const top = story.noteTop || 720;
    const shadow = await softShadow(note.input);
    layers.push({ input: shadow, left: 44 - 20 + 2, top: top - 20 + 3 }, { input: shadow, left: 44 - 20 + 2, top: top - 20 + 3 });
    layers.push({ ...note, left: 44, top });
    const [tx, ty] = story.noteTarget || [0.38, 0.55];
    const to = [W * tx, H * ty];
    const from = to[1] > top + note.height ? [44 + note.width * 0.45, top + note.height + 6] : [44 + note.width * 0.6, top - 6];
    const seed = seedOf(story.id) + 3;
    const light = doodle.arrow(W, H, from, to, [40, 30], C.cream, random(seed));
    const dark = doodle.arrow(W, H, from, to, [40, 30], "#141010", random(seed));
    layers.push({ input: await sharp(dark.input).blur(5).png().toBuffer(), left: 0, top: 0, arrowTip: to }, { input: light.input, left: 0, top: 0, arrowTip: to });
  }

  // Selo de produção limitada.
  if (story.fomo) {
    const d = 230;
    const words = await text(story.fomo, { size: 40, weight: "hand", color: T.stickerInk, width: 180, align: "centre", lineHeight: 0.92 });
    const disc = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="${T.sticker}"/><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 15}" fill="none" stroke="${T.stickerInk}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="7 7"/></svg>`);
    const stamp = await sharp(disc).composite([{ input: words.input, left: Math.round((d - words.width) / 2), top: Math.round((d - words.height) / 2) }]).png().toBuffer();
    // No canto direito da área do título (livre), como um selo carimbado.
    const tilted = await rotated({ input: stamp }, 8);
    const top = story.fomoTop || 380;
    const left = W - 30 - tilted.width;
    const shadow = await softShadow(tilted.input, 24, 12);
    layers.push({ input: shadow, left: left - 24 + 4, top: top - 24 + 8 }, { input: tilted.input, left, top });
  }

  // Cartões de cenário de uso (mini-foto + legenda).
  const cards = story.scenes || [];
  let cy = 1250;
  if (cards.length) {
    const gap = 14;
    const cw = Math.floor((W - 88 - gap * (cards.length - 1)) / cards.length);
    const photoH = 150;
    for (const [i, card] of cards.entries()) {
      const cx = 44 + i * (cw + gap);
      const ch = photoH + 86;
      const frame = Buffer.from(`<svg width="${cw}" height="${ch}"><rect x="1" y="1" width="${cw - 2}" height="${ch - 2}" rx="18" fill="${T.card}" stroke="${C.cream}" stroke-opacity=".6" stroke-width="2"/></svg>`);
      layers.push({ input: frame, left: cx, top: cy });
      layers.push({ input: await roundedPhoto(card.photo, cw - 12, photoH, 13), left: cx + 6, top: cy + 6 });
      const title = await text(card.title.toUpperCase(), { size: 19, weight: 800, color: T.cardInk, spacing: 0.06 });
      const ic = 28;
      const rowW = ic + 8 + title.width;
      layers.push({ input: icon(card.icon, ic, T.cardInk, 2), left: cx + Math.round((cw - rowW) / 2), top: cy + photoH + 16 });
      layers.push({ ...title, left: cx + Math.round((cw - rowW) / 2) + ic + 8, top: cy + photoH + 16 + Math.round((ic - title.height) / 2) });
      const sub = await text(card.sub, { size: 18, weight: 400, color: T.cardInk, width: cw - 20, align: "centre", lineHeight: 1.05 });
      layers.push({ ...sub, left: cx + Math.round((cw - sub.width) / 2), top: cy + photoH + 50 });
    }
    cy += photoH + 86 + 18;
  }

  // Preço (ou combos) + cores/tamanho numa faixa.
  if (story.combos) {
    const unit = products[story.combos.unit];
    const kit = products[story.combos.kit];
    const save = unit.price * story.combos.kitQty - kit.price;
    const half = Math.floor((W - 88 - 14) / 2);
    const boxH = 116;
    const boxes = [
      { x: 44, fill: T.panel, ink: T.panelInk, label: "1 unidade", price: unit.price },
      { x: 44 + half + 14, fill: C.copper, ink: C.cream, label: `Kit ${story.combos.kitQty} unidades`, price: kit.price, save },
    ];
    // Um tamanho de preço para os dois cartões: o maior em que todos cabem
    // sem encostar no selo "Economize" (16 px de folga).
    let priceSize = 46;
    for (; priceSize > 30; priceSize -= 2) {
      let fits = true;
      for (const box of boxes) {
        const sw = box.save ? (await text(`Economize ${money(box.save)}`, { size: 22, weight: 800, color: C.cream })).width + 32 : 0;
        const room = box.save ? half - 26 - sw - 16 - 16 : half - 52;
        if ((await text(money(box.price), { size: priceSize, weight: "mono", color: box.ink })).width > room) fits = false;
      }
      if (fits) break;
    }
    const fullH = (await text(money(boxes[0].price), { size: 46, weight: "mono", color: boxes[0].ink })).height;
    for (const box of boxes) {
      layers.push({ input: Buffer.from(`<svg width="${half}" height="${boxH}"><rect width="${half}" height="${boxH}" rx="20" fill="${box.fill}"/></svg>`), left: box.x, top: cy });
      const lab = await text(box.label, { size: 26, weight: 700, color: box.ink });
      layers.push({ ...lab, left: box.x + 26, top: cy + 18 });
      const sv = box.save ? await text(`Economize ${money(box.save)}`, { size: 22, weight: 800, color: C.cream }) : null;
      const sw = sv ? sv.width + 32 : 0;
      const pr = await text(money(box.price), { size: priceSize, weight: "mono", color: box.ink });
      // Fonte reduzida fica alinhada pela base, onde estaria a de 46.
      layers.push({ ...pr, left: box.x + 26, top: cy + 50 + fullH - pr.height });
      if (sv) {
        layers.push({ input: pill('', { width: sw, height: 40, fill: '#5f6549' }), left: box.x + half - sw - 16, top: cy + boxH - 40 - 16 });
        layers.push({ ...sv, left: box.x + half - sw - 16 + 16, top: cy + boxH - 40 - 16 + Math.round((40 - sv.height) / 2) });
        const best = await text("MAIS VANTAJOSO", { size: 18, weight: 800, color: C.copper, spacing: 0.12 });
        const bw = best.width + 30;
        layers.push({ input: pill("", { width: bw, height: 34, fill: C.cream }), left: box.x + half - bw - 16, top: cy + 14 });
        layers.push({ ...best, left: box.x + half - bw - 16 + 15, top: cy + 14 + Math.round((34 - best.height) / 2) });
      }
    }
    cy += boxH + 16;
  } else {
    const pr = await text(money(product.price), { size: 70, weight: "mono", color: T.ink });
    let px = 44;
    if (story.priceFrom) {
      const from = await text("a partir de", { size: 38, weight: "hand", color: T.accent });
      layers.push({ ...from, left: px, top: cy + 22 });
      px += from.width + 12;
    }
    const pb = brush(pr.width + 56, pr.height + 22, T.brush, rand);
    layers.push({ input: pb, left: px - 20, top: cy - 6 });
    layers.push({ ...pr, left: px + 8, top: cy + 4 });
    // Cores com nome (e tamanho) à direita.
    const colors = story.colors || JSON.parse(product.colors || "[]");
    const right = W - 44;
    if (colors.length > 1) {
      const dot = 40;
      const cell = colors.length > 5 ? 62 : 84;
      const rowW = cell * Math.min(colors.length, 8);
      const x0 = right - rowW;
      const cap = await text(story.colorsNote || `${colors.length} cores`, { size: 32, weight: "hand", color: T.accent });
      layers.push({ ...cap, left: x0 + Math.round((rowW - cap.width) / 2), top: cy - 18 });
      for (const [i, color] of colors.slice(0, 8).entries()) {
        const x = x0 + i * cell;
        layers.push({ input: shadedSwatch(color, dot), left: x + Math.round((cell - dot) / 2), top: cy + 26 });
        if (colors.length <= 5) {
          const nm = await text(shortColor(color), { size: 17, weight: 500, color: T.ink });
          layers.push({ ...nm, left: x + Math.round((cell - nm.width) / 2), top: cy + 26 + dot + 4 });
        }
      }
    }
    cy += pr.height + 36;
  }
  if (story.size) {
    const sz = await text(`${story.size}`, { size: 22, weight: 700, color: T.ink });
    layers.push({ input: icon("regua", 26, T.accent), left: 44, top: cy - 22 });
    layers.push({ ...sz, left: 78, top: cy - 20 });
    cy += 18;
  }

  // Botão para o link da bio (a loja registra o orçamento direto no sistema; nenhum telefone na arte).
  const ctaH = 96;
  const ctaTop = Math.max(cy, 1630);
  layers.push({ input: pill("", { width: W - 88, height: ctaH, fill: T.cta }), left: 44, top: ctaTop });
  layers.push({ input: icon("link", 50, T.ctaInk, 2), left: 79, top: ctaTop + 23 });
  layers.push({ input: Buffer.from(`<svg width="2" height="60"><rect width="2" height="60" fill="${T.ctaInk}" opacity=".5"/></svg>`), left: 152, top: ctaTop + 18 });
  const l1 = await text("PEÇA SEU ORÇAMENTO PELO LINK DA BIO", { size: 25, weight: 800, color: T.ctaInk, spacing: 0.04 });
  const l2 = await text(`loja completa em ${SITE}`, { size: 22, weight: 500, color: T.ctaInk });
  const th = l1.height + 8 + l2.height;
  layers.push({ ...l1, left: 176, top: ctaTop + Math.round((ctaH - th) / 2) });
  layers.push({ ...l2, left: 176, top: ctaTop + Math.round((ctaH - th) / 2) + l1.height + 8 });
  layers.push({ input: icon("seta", 34, T.ctaInk, 2.4), left: W - 44 - 58, top: ctaTop + 31 });
  const tl = doodle.ticks("left", T.doodle, rand);
  const tr = doodle.ticks("right", T.doodle, rand);
  layers.push({ ...tl, left: -10, top: ctaTop + 12 }, { ...tr, left: W - 50, top: ctaTop + 12 });

  // Assinatura.
  const sign = await text(story.signature || "Feito à mão, camada por camada", { size: 34, weight: "hand", color: T.accent });
  layers.push({ ...sign, left: Math.round((W - sign.width) / 2), top: ctaTop + ctaH + 12 });

  // Regra: nada pode cobrir o produto. Qualquer camada que invada a caixa derruba a geração.
  const hits = [];
  for (const [i, layer] of layers.entries()) {
    if (i < fixed) continue;
    if (layer.arrowTip) {
      const [x, y] = layer.arrowTip;
      if (x > box[0] && x < box[2] && y > box[1] && y < box[3]) hits.push(`ponta da seta em ${Math.round(x)},${Math.round(y)}`);
      continue;
    }
    const meta = layer.width && layer.height ? layer : await sharp(layer.input).metadata();
    const r = [layer.left, layer.top, layer.left + meta.width, layer.top + meta.height];
    if (r[0] < box[2] && r[2] > box[0] && r[1] < box[3] && r[3] > box[1]) hits.push(`camada ${i} em [${r.join(', ')}]`);
  }
  if (hits.length) throw new Error(`${story.id}: elementos por cima do produto ${JSON.stringify(box)} → ${hits.join('; ')}`);
  return sharp(canvas(H, C.cream)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

// ─── Carrossel cheio (4:5) ────────────────────────────────────────────────────
// Capa com vitrine de peças, slide por produto (foto sem nada por cima + nome,
// frase à mão, preço em pincelada, cores, tamanho e ícones de uso) e "Como
// pedir" no vinho. Mesmas regras dos stories: logo sempre, link da bio,
// produção limitada, nada cobrindo o produto.
const CH = 1350;

function footerCheio(layers, { index, total, dark = false }) {
  return (async () => {
    const top = CH - 88;
    layers.push({ input: Buffer.from(`<svg width="${W - 88}" height="2"><rect width="${W - 88}" height="2" fill="${dark ? "#7a4a4d" : C.border}"/></svg>`), left: 44, top });
    const mark = await logo(dark ? path.join(ROOT, "public", "logo-ac3d-monograma-claro.png") : MONOGRAM, 46);
    layers.push({ input: mark, left: 44, top: top + 22 });
    const brand = await text("AC3D STUDIO", { size: 20, weight: 700, color: dark ? C.cream : C.copper, spacing: 0.16 });
    layers.push({ ...brand, left: 100, top: top + 36 });
    const cta = await text("Peça pelo link da bio", { size: 22, weight: 700, color: dark ? C.cream : C.copper });
    const ctaW = cta.width + 40;
    const cx = Math.round((W - ctaW) / 2) + 40;
    layers.push({ input: icon("link", 26, dark ? C.cream : C.copper, 2.2), left: cx - 40, top: top + 32 });
    layers.push({ ...cta, left: cx, top: top + 34 });
    if (total) {
      const counter = await text(`${index}/${total}`, { size: 22, weight: "mono", color: dark ? C.cream : C.muted });
      layers.push({ ...counter, left: W - 44 - counter.width, top: top + 34 });
    }
  })();
}

async function coverCheio(slide, products) {
  const rand = random(seedOf(slide.title || "capa"));
  const layers = [];
  layers.push({ input: await logo(LOGO, 118), left: 44, top: 36 });
  if (slide.tag) {
    const tag = await text(slide.tag.toUpperCase(), { size: 22, weight: 800, color: C.cream, spacing: 0.14 });
    const tw = tag.width + 48;
    layers.push({ input: pill("", { width: tw, height: 52, fill: C.copper }), left: W - 44 - tw, top: 58 });
    layers.push({ ...tag, left: W - 44 - tw + 24, top: 58 + Math.round((52 - tag.height) / 2) });
  }
  let y = 180;
  const head = await text(slide.headline, { size: 76, weight: 800, color: C.ink });
  layers.push({ ...head, left: 44, top: y });
  y += head.height - 14;
  const script = await rotated(await text(slide.script, { size: 150, weight: "hand", color: C.copper }), -3);
  layers.push({ input: brush(script.width + 40, Math.round(script.height * 0.5), "#ead9c6", rand), left: 30, top: y + Math.round(script.height * 0.42) });
  layers.push({ ...script, left: 44, top: y });
  const heart = doodle.heart(64, C.copper, rand);
  layers.push({ ...heart, left: 44 + script.width + 6, top: y + Math.round(script.height * 0.3) });
  y += script.height + 14;
  if (slide.subline) {
    const sub = await text(slide.subline.toUpperCase(), { size: 21, weight: 700, color: C.olive, spacing: 0.14, width: 640 });
    layers.push({ ...sub, left: 46, top: y });
    y += sub.height + 12;
    layers.push({ input: ornament(320, C.olive), left: 46, top: y });
  }
  if (slide.fomo) {
    const d = 210;
    const words = await text(slide.fomo, { size: 36, weight: "hand", color: C.cream, width: 160, align: "centre", lineHeight: 0.92 });
    const disc = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="${C.copper}"/><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 14}" fill="none" stroke="${C.cream}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="7 7"/></svg>`);
    const tilted = await rotated({ input: await sharp(disc).composite([{ input: words.input, left: Math.round((d - words.width) / 2), top: Math.round((d - words.height) / 2) }]).png().toBuffer() }, 8);
    layers.push({ input: tilted.input, left: W - 40 - tilted.width, top: 150 });
  }
  // Vitrine: 2 linhas × 3 peças (foto 4:3 inteira, nome e preço).
  const tileW = 320;
  const photoH = 240;
  let ty = 540;
  for (const [i, item] of (slide.items || []).slice(0, 6).entries()) {
    const product = products[item.sku];
    const tx = 40 + (i % 3) * (tileW + 20);
    if (i === 3) ty += photoH + 118;
    layers.push({ input: await roundedPhoto(item.photo, tileW, photoH, 18), left: tx, top: ty });
    const name = await text(item.name || product.name, { size: 21, weight: 700, color: C.ink, width: tileW - 6, lineHeight: 1.05 });
    layers.push({ ...name, left: tx + 2, top: ty + photoH + 10 });
    const price = await text(money(product.price), { size: 24, weight: "mono", color: C.copper });
    layers.push({ ...price, left: tx + 2, top: ty + photoH + 14 + name.height });
  }
  const swipe = await text("Arraste para ver cada peça  →", { size: 24, weight: 700, color: C.cream });
  const sw = swipe.width + 56;
  layers.push({ input: pill("", { width: sw, height: 58, fill: C.copper }), left: W - 44 - sw, top: CH - 96 });
  layers.push({ ...swipe, left: W - 44 - sw + 28, top: CH - 96 + Math.round((58 - swipe.height) / 2) });
  const handle = await text(HANDLE, { size: 24, weight: 700, color: C.copper });
  layers.push({ ...handle, left: 44, top: CH - 80 });
  return sharp(canvas(CH)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

async function productCheio(slide, product, index, total) {
  const rand = random(seedOf(`${slide.sku}-${index}`));
  // Foto 4:3 inteira, sem nada por cima (regra: produto sempre visível).
  const layers = [{ input: await roundedPhoto(slide.photo, 1000, 750, 28), left: 40, top: 40 }];
  let y = 818;
  const label = await text((slide.label || product.category).toUpperCase(), { size: 21, weight: 700, color: C.olive, spacing: 0.16 });
  layers.push({ ...label, left: 44, top: y + 8 });
  if (slide.fomo !== false) {
    const tag = await text((slide.fomo || "Produção limitada").toUpperCase(), { size: 17, weight: 800, color: C.cream, spacing: 0.12 });
    const tw = tag.width + 36;
    layers.push({ input: pill("", { width: tw, height: 38, fill: C.copper }), left: W - 44 - tw, top: y });
    layers.push({ ...tag, left: W - 44 - tw + 18, top: y + Math.round((38 - tag.height) / 2) });
  }
  y += 46;
  const name = await text(slide.name || product.name, { size: 50, weight: 800, color: C.ink, width: 1000, lineHeight: 1.0 });
  layers.push({ ...name, left: 44, top: y });
  y += name.height - 2;
  if (slide.accent) {
    const accent = await rotated(await text(slide.accent, { size: 44, weight: "hand", color: C.copper }), -2);
    layers.push({ ...accent, left: 44, top: y });
    const heart = doodle.heart(40, C.copper, rand);
    layers.push({ ...heart, left: 44 + accent.width + 8, top: y + Math.round((accent.height - 40) / 2) });
    const swash = doodle.swash(Math.min(520, accent.width + 30), C.copper, rand);
    layers.push({ ...swash, left: 36, top: y + accent.height - 16 });
    y += accent.height + 30;
  }
  if (slide.line) {
    const line = await text(slide.line, { size: 25, weight: 400, color: C.muted, width: 1000 });
    layers.push({ ...line, left: 44, top: y });
    y += line.height + 34;
  }
  // Preço em pincelada à esquerda; cores com nome à direita.
  const priceTop = y;
  let px = 44;
  if (slide.priceFrom) {
    const from = await text("a partir de", { size: 32, weight: "hand", color: C.copper });
    layers.push({ ...from, left: px, top: priceTop + 14 });
    px += from.width + 10;
  }
  const price = await text(money(product.price), { size: 56, weight: "mono", color: C.ink });
  layers.push({ input: brush(price.width + 50, price.height + 18, "#ead9c6", rand), left: px - 18, top: priceTop - 6 });
  layers.push({ ...price, left: px + 6, top: priceTop + 2 });
  if (slide.size) {
    const size = await text(slide.size, { size: 20, weight: 700, color: C.ink });
    layers.push({ input: icon("regua", 24, C.copper), left: 44, top: priceTop + price.height + 16 });
    layers.push({ ...size, left: 74, top: priceTop + price.height + 18 });
  }
  const colors = slide.colors || JSON.parse(product.colors || "[]");
  if (colors.length > 1) {
    const dot = 36;
    const named = colors.length <= 5;
    const cell = named ? 92 : 56;
    const rowW = cell * Math.min(colors.length, 8);
    const x0 = W - 44 - rowW;
    const cap = await text(`${colors.length} cores`, { size: 30, weight: "hand", color: C.copper });
    layers.push({ ...cap, left: x0 + Math.round((rowW - cap.width) / 2), top: priceTop - 24 });
    for (const [i, color] of colors.slice(0, 8).entries()) {
      const x = x0 + i * cell;
      layers.push({ input: shadedSwatch(color, dot), left: x + Math.round((cell - dot) / 2), top: priceTop + 16 });
      if (named) {
        const nm = await text(shortColor(color), { size: 16, weight: 500, color: C.ink });
        layers.push({ ...nm, left: x + Math.round((cell - nm.width) / 2), top: priceTop + 16 + dot + 4 });
      }
    }
  }
  y = priceTop + price.height + (slide.size ? 70 : 42);
  // Ícones de uso numa linha.
  const uses = (slide.uses || []).slice(0, 3);
  const colW = Math.floor((W - 88) / Math.max(uses.length, 1));
  for (const [i, item] of uses.entries()) {
    const x = 44 + i * colW;
    layers.push({ input: Buffer.from(`<svg width="52" height="52"><circle cx="26" cy="26" r="24" fill="${C.paper}" stroke="${C.copper}" stroke-width="2"/></svg>`), left: x, top: y });
    layers.push({ input: icon(item.icon, 26, C.copper, 1.9), left: x + 13, top: y + 13 });
    const lab = await text(item.label, { size: 19, weight: 700, color: C.ink, width: colW - 72, lineHeight: 1.05 });
    layers.push({ ...lab, left: x + 62, top: y + Math.round((52 - lab.height) / 2) });
  }
  await footerCheio(layers, { index, total });
  return sharp(canvas(CH)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

async function ctaCheio(slide, index, total) {
  const layers = [];
  const mark = await logo(LOGO_LIGHT, 190);
  const markW = (await sharp(mark).metadata()).width;
  let y = 0;
  layers.push({ input: mark, left: Math.round((W - markW) / 2), top: y });
  y += 190 + 26;
  const heading = await text(slide.heading || "Como pedir", { size: 58, weight: 800, color: C.cream, width: 1000, align: "centre" });
  layers.push({ ...heading, left: Math.round((W - heading.width) / 2), top: y });
  y += heading.height - 6;
  if (slide.accent) {
    const accent = await rotated(await text(slide.accent, { size: 48, weight: "hand", color: "#f3c9a8" }), -2);
    layers.push({ ...accent, left: Math.round((W - accent.width) / 2), top: y });
    y += accent.height + 18;
  }
  const steps = slide.steps || [
    { icon: "link", title: "Acesse o link da bio", sub: "A loja completa da AC3D" },
    { icon: "paleta", title: "Escolha peças e cores", sub: "Veja preços e prazos" },
    { icon: "enviar", title: "Peça seu orçamento", sub: "A gente confirma tudo com você" },
  ];
  for (const [i, step] of steps.entries()) {
    const cardH = 100;
    layers.push({ input: Buffer.from(`<svg width="900" height="${cardH}"><rect width="900" height="${cardH}" rx="22" fill="${C.cream}"/></svg>`), left: 90, top: y });
    const num = await text(String(i + 1), { size: 28, weight: "mono", color: C.cream });
    layers.push({ input: Buffer.from(`<svg width="58" height="58"><circle cx="29" cy="29" r="29" fill="${C.copper}"/></svg>`), left: 114, top: y + 21 });
    layers.push({ ...num, left: 114 + Math.round((58 - num.width) / 2), top: y + 21 + Math.round((58 - num.height) / 2) });
    layers.push({ input: icon(step.icon, 34, C.copper, 2), left: 196, top: y + 33 });
    const t1 = await text(step.title, { size: 28, weight: 800, color: C.ink });
    const t2 = await text(step.sub, { size: 21, weight: 400, color: C.muted });
    const th = t1.height + 6 + t2.height;
    layers.push({ ...t1, left: 252, top: y + Math.round((cardH - th) / 2) });
    layers.push({ ...t2, left: 252, top: y + Math.round((cardH - th) / 2) + t1.height + 6 });
    y += cardH + 16;
  }
  if (slide.note) {
    const note = await text(slide.note, { size: 23, weight: 400, color: "#e3cfc9", width: 860, align: "centre" });
    layers.push({ ...note, left: Math.round((W - note.width) / 2), top: y + 4 });
    y += note.height + 16;
  }
  const fomo = await text((slide.fomo || "Produção limitada — garanta o seu").toUpperCase(), { size: 21, weight: 800, color: C.copper, spacing: 0.1 });
  const fw = fomo.width + 60;
  y += 10;
  layers.push({ input: pill("", { width: fw, height: 54, fill: "#f3c9a8" }), left: Math.round((W - fw) / 2), top: y });
  layers.push({ ...fomo, left: Math.round((W - fomo.width) / 2), top: y + Math.round((54 - fomo.height) / 2) });
  y += 54 + 22;
  const site = await text(SITE, { size: 26, weight: "mono", color: C.cream });
  layers.push({ ...site, left: Math.round((W - site.width) / 2), top: y });
  y += site.height + 12;
  const sign = await text(slide.signature || "Feito à mão, camada por camada", { size: 38, weight: "hand", color: "#f3c9a8" });
  layers.push({ ...sign, left: Math.round((W - sign.width) / 2), top: y });
  y += sign.height;
  const offset = Math.round((CH - 88 - y) / 2);
  for (const layer of layers) layer.top += offset;
  await footerCheio(layers, { index, total, dark: true });
  return sharp(canvas(CH, C.copperDeep)).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

(async () => {
  const specFile = process.argv[2];
  if (!specFile) return console.log("uso: node scripts/instagram-artes.cjs scripts/instagram/<pauta>.json");
  const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
  const prisma = new PrismaClient();
  const products = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.sku, p]));
  await prisma.$disconnect();
  const outRoot = path.join(PHOTOS, "instagram", spec.pack);
  // Stories sem tema fixo alternam claro/escuro, começando por um lado sorteado.
  let dark = Math.random() < 0.5;
  for (const post of spec.posts) if ((post.type === "story-rico" || post.type === "story-cheio") && !post.theme) post.theme = (dark = !dark) ? "vinho" : "creme";
  for (const post of spec.posts) {
    const dir = path.join(outRoot, post.id);
    fs.mkdirSync(dir, { recursive: true });
    const productOf = (sku) => {
      if (!products[sku]) throw new Error(`SKU ${sku} não existe no Catálogo`);
      return products[sku];
    };
    if (post.type === "carousel") {
      const numbered = post.slides.filter((slide) => slide.kind === "product").length;
      let index = 0;
      for (const [i, slide] of post.slides.entries()) {
        const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`);
        let buffer;
        if (slide.kind === "cover") buffer = await coverSlide(slide);
        else if (slide.kind === "cta") buffer = await ctaSlide(slide);
        else if (slide.kind === "cover-cheio") {
          for (const item of slide.items || []) productOf(item.sku);
          buffer = await coverCheio(slide, products);
        } else if (slide.kind === "cta-cheio") buffer = await ctaCheio(slide, i + 1, post.slides.length);
        else if (slide.kind === "product-cheio") buffer = await productCheio(slide, productOf(slide.sku), i + 1, post.slides.length);
        else buffer = await productSlide(slide, productOf(slide.sku), ++index, numbered);
        fs.writeFileSync(file, buffer);
      }
    } else if (post.type === "story-cheio") {
      fs.writeFileSync(path.join(dir, "story.jpg"), await storyFull(post, productOf(post.sku), products));
    } else if (post.type === "story-rico") {
      fs.writeFileSync(path.join(dir, "story.jpg"), await storyRich(post, productOf(post.sku)));
    } else if (post.type === "story" && post.kind === "cta-cheio") {
      // Mesmo slide "Como pedir" do carrossel, centralizado no 9:16 (fundo vinho).
      const slide = await ctaCheio(post);
      const pad = (1920 - CH) / 2;
      fs.writeFileSync(path.join(dir, "story.jpg"), await sharp(slide).extend({ top: pad, bottom: pad, background: C.copperDeep }).jpeg({ quality: 92 }).toBuffer());
    } else if (post.type === "story") {
      const buffer = post.kind === "cta" ? await ctaSlide(post, 1920) : await storySlide(post, productOf(post.sku));
      fs.writeFileSync(path.join(dir, "story.jpg"), buffer);
    }
    const header = [`${post.title || post.id}`, post.when ? `Quando: ${post.when}` : "", ""].filter((line, i) => line || i === 2).join("\n");
    fs.writeFileSync(path.join(dir, "legenda.txt"), `${header}\n${post.caption || ""}\n`);
    console.log("ok", post.id);
  }
  console.log("saída:", outRoot);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
