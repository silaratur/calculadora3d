// Sobe uma pauta gerada pelo instagram-artes.cjs (uma pasta por post, com os
// slides .jpg e o legenda.txt) para a fila da Divulgação, sempre como RASCUNHO:
//
//   node scripts/instagram-enviar.cjs public/Highsfield/instagram/<pauta> <url-do-app> "session_token=<cookie>"
//
// Nada é publicado: cada post ainda passa pela revisão e aprovação na tela.
const fs = require("fs");
const path = require("path");
const [dir, base, cookie] = process.argv.slice(2);
const DAYS = { segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6, domingo: 0 };
(async () => {
  for (const folder of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, folder);
    if (!fs.statSync(full).isDirectory()) continue;
    const lines = fs.readFileSync(path.join(full, "legenda.txt"), "utf8").replace(/\r/g, "").split("\n");
    const [type, ...rest] = lines[0].split("·");
    const kind = /carrossel/i.test(type) ? "CAROUSEL" : /story/i.test(type) ? "STORY" : "IMAGE";
    const when = /(\d{1,2})\/(\d{1,2}),?\s*(\d{1,2})h(\d{2})?/.exec(lines[1] || "");
    // Horário de Brasília (UTC−3).
    const scheduledAt = when ? new Date(Date.UTC(2026, Number(when[2]) - 1, Number(when[1]), Number(when[3]) + 3, Number(when[4] || 0))).toISOString() : null;
    const caption = kind === "STORY" ? "" : lines.slice(2).join("\n").trim();
    const images = fs.readdirSync(full).filter((f) => f.endsWith(".jpg")).sort().map((f) => `data:image/jpeg;base64,${fs.readFileSync(path.join(full, f)).toString("base64")}`);
    const response = await fetch(`${base}/api/instagram/posts`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ title: rest.join("·").trim(), kind, caption, scheduledAt, images }) });
    const body = await response.json();
    console.log(response.status, folder, kind, images.length, scheduledAt, body.error || body.id);
  }
})();
