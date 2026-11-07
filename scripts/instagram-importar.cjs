// Importa pautas geradas pelo instagram-artes.cjs direto no banco, SEMPRE como
// RASCUNHO, para a fila da Divulgação. Roda no servidor pelo deploy do GitHub
// (passo "Importar pautas do Instagram"), sem precisar de sessão de login:
//
//   DATABASE_URL="file:/opt/calculadora3d/data/prod.db" node scripts/instagram-importar.cjs instagram-import
//
// <pasta>/<pauta>/<post>/ com legenda.txt + slides .jpg, story.mp4 ou reel.mp4
// (mesmo formato do instagram-enviar.cjs). Post com o mesmo título e horário já
// na fila (em qualquer situação, inclusive reprovado) é pulado, então o passo
// pode rodar a cada deploy sem duplicar nada. Nada é publicado: cada post ainda
// passa pela aprovação na tela.
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.log("instagram-importar: nada para importar");
  process.exit(0);
}

// Mesma regra de src/lib/instagram-media.ts: mídia ao lado do banco.
const dbFile = (process.env.DATABASE_URL || "").replace(/^file:/, "");
if (!path.isAbsolute(dbFile)) throw new Error("Use DATABASE_URL com caminho absoluto (file:/…/prod.db).");
const mediaRoot = process.env.INSTAGRAM_MEDIA_DIR || path.join(path.dirname(dbFile), "instagram-media");

function readPost(full) {
  const lines = fs.readFileSync(path.join(full, "legenda.txt"), "utf8").replace(/\r/g, "").split("\n");
  const [type, ...rest] = lines[0].split("·");
  const kind = /carrossel/i.test(type) ? "CAROUSEL" : /story/i.test(type) ? "STORY" : /reel/i.test(type) ? "REEL" : "IMAGE";
  const when = /(\d{1,2})\/(\d{1,2}),?\s*(\d{1,2})h(\d{2})?/.exec(lines[1] || "");
  const year = Number(process.env.PAUTA_ANO || new Date().getFullYear());
  // Horário de Brasília (UTC−3).
  const scheduledAt = when ? new Date(Date.UTC(year, Number(when[2]) - 1, Number(when[1]), Number(when[3]) + 3, Number(when[4] || 0))) : null;
  const caption = kind === "STORY" ? "" : lines.slice(2).join("\n").trim();
  const video = kind === "REEL" || (kind === "STORY" && fs.existsSync(path.join(full, "story.mp4")));
  const files = fs.readdirSync(full).filter((f) => (video ? f.endsWith(".mp4") && !f.includes("-mudo") : f.endsWith(".jpg"))).sort();
  return { title: rest.join("·").trim(), kind, caption, scheduledAt, files };
}

(async () => {
  const prisma = new PrismaClient();
  let created = 0;
  let skipped = 0;
  for (const pack of fs.readdirSync(root).sort()) {
    const packDir = path.join(root, pack);
    if (!fs.statSync(packDir).isDirectory()) continue;
    for (const folder of fs.readdirSync(packDir).sort()) {
      const full = path.join(packDir, folder);
      if (!fs.statSync(full).isDirectory() || !fs.existsSync(path.join(full, "legenda.txt"))) continue;
      const post = readPost(full);
      if (!post.files.length) throw new Error(`${pack}/${folder}: sem mídia`);
      if (post.kind !== "CAROUSEL" && post.files.length !== 1) throw new Error(`${pack}/${folder}: ${post.kind} precisa de 1 arquivo`);
      const exists = await prisma.instagramPost.findFirst({ where: { title: post.title, scheduledAt: post.scheduledAt } });
      if (exists) {
        skipped++;
        continue;
      }
      const row = await prisma.instagramPost.create({ data: { title: post.title, kind: post.kind, caption: post.caption, scheduledAt: post.scheduledAt, status: "DRAFT" } });
      try {
        const dir = path.join(mediaRoot, row.id);
        fs.mkdirSync(dir, { recursive: true });
        const media = post.files.map((file) => {
          const name = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}.${file.endsWith(".mp4") ? "mp4" : "jpg"}`;
          fs.copyFileSync(path.join(full, file), path.join(dir, name));
          return name;
        });
        await prisma.instagramPost.update({ where: { id: row.id }, data: { media: JSON.stringify(media) } });
        created++;
        console.log("rascunho", pack, folder, post.kind, media.length, post.scheduledAt && post.scheduledAt.toISOString());
      } catch (error) {
        await prisma.instagramPost.delete({ where: { id: row.id } });
        fs.rmSync(path.join(mediaRoot, row.id), { recursive: true, force: true });
        throw error;
      }
    }
  }
  await prisma.$disconnect();
  console.log(`instagram-importar: ${created} rascunho(s) novo(s), ${skipped} já estavam na fila`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
