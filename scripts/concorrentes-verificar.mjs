// Verificação dos preços dos concorrentes (terças e sextas, Agendador do Windows).
// Abre cada anúncio salvo no Catálogo → Concorrência no Chrome dedicado, que já
// tem o login da Shopee e do Mercado Livre (eles bloqueiam navegador anônimo),
// lê o preço atual e manda o resultado para /api/concorrentes/verificacao.
// Só lê as páginas: não clica, não compra, não contorna bloqueio — captcha ou
// login vencido viram ERRO e o anúncio fica como estava.
//
//   node scripts/concorrentes-verificar.mjs [--alvo prod|dev] [--so shopee] [--limite N] [--simular]
//
// Chave: prod lê %USERPROFILE%\.ac3d\report-key-prod; dev lê REPORT_API_KEY do .env.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = homedir();
const CHROME = path.join(HOME, ".agent-browser", "browsers", "chrome-154.0.8037.57", "chrome.exe");
const PROFILE = path.join(HOME, ".agent-browser", "profiles", "ac3d-marketplaces");
const PORT = 9333;
const LOG_DIR = path.join(HOME, ".ac3d", "logs");

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const target = arg("alvo") ?? "prod";
const limit = Number(arg("limite") ?? 0);
const only = arg("so"); // só os anúncios cujo link contém este texto
const dryRun = process.argv.includes("--simular");
const BASE = target === "prod" ? "https://calculadora3d.silaratur.cloud" : "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `concorrentes-${new Date().toISOString().slice(0, 10)}.log`);
const log = (...parts) => { const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${parts.join(" ")}`; console.log(line); appendFileSync(logFile, line + "\n"); };

function reportKey() {
  if (target === "prod") return readFileSync(path.join(HOME, ".ac3d", "report-key-prod"), "utf8").trim();
  const env = readFileSync(path.join(ROOT, ".env"), "utf8");
  return env.match(/^REPORT_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)?.[1] ?? "";
}

async function ensureChrome() {
  const ready = () => fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false);
  if (await ready()) return;
  if (!existsSync(CHROME)) throw new Error(`Chrome dedicado não encontrado em ${CHROME}`);
  spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30; i += 1) { await sleep(1000); if (await ready()) return; }
  throw new Error("Chrome não respondeu na porta de depuração");
}

/** Sessão CDP numa aba nova (em segundo plano), com fila de eventos. */
async function openTab() {
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  return {
    send,
    on: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`).catch(() => {}); },
  };
}

async function evaluate(tab, expression) {
  const response = await tab.send("Runtime.evaluate", { expression, returnByValue: true });
  return response.result?.result?.value;
}

async function navigate(tab, url, waitMs) {
  await tab.send("Page.navigate", { url });
  for (let i = 0; i < 30; i += 1) {
    await sleep(500);
    if ((await evaluate(tab, "document.readyState")) === "complete") break;
  }
  await sleep(waitMs);
}

const BLOCKED = /captcha|verifica[çc][aã]o de seguran[çc]a|account-verification|security check|não sou um rob/i;

/** Mercado Livre: preço do anúncio (meta itemprop=price ou o bloco de preço). */
async function checkMercadoLivre(tab, entry) {
  await navigate(tab, entry.url, 2500);
  const page = await evaluate(tab, `(() => {
    const text = document.body ? document.body.innerText.slice(0, 20000) : "";
    const meta = document.querySelector('meta[itemprop="price"]');
    const fraction = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction');
    const cents = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__cents');
    const shown = fraction ? Number(fraction.textContent.replace(/\\D/g, "")) + (cents ? Number(cents.textContent.replace(/\\D/g, "")) / 100 : 0) : null;
    return { url: location.href, text, meta: meta ? Number(meta.getAttribute("content")) : null, shown };
  })()`);
  if (!page) return { status: "ERRO", note: "página não carregou" };
  if (BLOCKED.test(page.text) || /\/login|lgz/.test(page.url)) return { status: "ERRO", note: "bloqueio/login" };
  if (/pausad|finalizad|não está mais disponível|não está disponível|publicação foi removida/i.test(page.text.slice(0, 4000)) && !page.shown) return { status: "INDISPONIVEL" };
  const price = page.shown || page.meta;
  if (!price) {
    if (/lista\.mercadolivre|\/busca|_NoIndex/i.test(page.url)) return { status: "INDISPONIVEL", note: "redirecionou para a busca" };
    // Página de catálogo (/p/) sem vendedor: só "Você também pode estar interessado" e relacionados, sem botão de compra.
    if (page.text.length > 500 && !/Comprar agora|Adicionar ao carrinho/i.test(page.text)) return { status: "INDISPONIVEL", note: "sem oferta ativa" };
    return { status: "ERRO", note: "preço não encontrado" };
  }
  return { status: "OK", price };
}

/** Shopee: preço vem do JSON que a própria página carrega (pdp/get_pc). */
async function checkShopee(tab, entry) {
  await tab.send("Network.enable");
  let body = null;
  const requests = new Map();
  const off = tab.on(async (message) => {
    if (message.method === "Network.responseReceived" && /\/api\/v4\/pdp\/get_pc/.test(message.params.response.url)) requests.set(message.params.requestId, true);
    if (message.method === "Network.loadingFinished" && requests.has(message.params.requestId)) {
      const response = await tab.send("Network.getResponseBody", { requestId: message.params.requestId });
      body = response.result?.body ?? null;
    }
  });
  await navigate(tab, entry.url, 5000);
  off();
  await tab.send("Network.disable");
  if (!body) {
    const text = (await evaluate(tab, "document.body ? document.body.innerText.slice(0, 3000) : ''")) ?? "";
    return { status: "ERRO", note: BLOCKED.test(text) ? "bloqueio/captcha" : "sem resposta da página" };
  }
  const json = JSON.parse(body);
  if (json.error === 90309999) return { status: "ERRO", note: "antibot 90309999" };
  const item = json.data?.item;
  if (!item) return json.error ? { status: "INDISPONIVEL", note: `erro ${json.error}` } : { status: "ERRO", note: "sem item" };
  if (item.status !== undefined && item.status !== 1) return { status: "INDISPONIVEL" };
  const prices = [item.price, ...(item.models ?? []).map((model) => model.price)].filter(Boolean).map((value) => value / 100000);
  // Anúncio com variações: se o preço salvo ainda existe em alguma, não mudou.
  if (prices.some((value) => Math.abs(value - entry.price) < 0.01)) return { status: "OK", price: entry.price };
  return { status: "OK", price: item.price / 100000 };
}

async function main() {
  const key = reportKey();
  if (!key) throw new Error("Chave do relatório não encontrada");
  const headers = { "x-report-key": key, "Content-Type": "application/json" };
  const entries = await fetch(`${BASE}/api/concorrentes/verificacao`, { headers }).then((r) => { if (!r.ok) throw new Error(`GET ${r.status}`); return r.json(); });
  const filtered = only ? entries.filter((entry) => entry.url.includes(only)) : entries;
  const list = limit ? filtered.slice(0, limit) : filtered;
  log(`Verificação ${target}: ${list.length} anúncios`);

  await ensureChrome();
  const tab = await openTab();
  const results = [];
  let blockedInRow = 0;
  try {
    for (const [index, entry] of list.entries()) {
      const isShopee = /shopee\.com\.br/.test(entry.url);
      let result;
      try {
        result = blockedInRow >= 5 ? { status: "ERRO", note: "rodada pausada após bloqueios" } : isShopee ? await checkShopee(tab, entry) : await checkMercadoLivre(tab, entry);
      } catch (error) {
        result = { status: "ERRO", note: error.message };
      }
      blockedInRow = result.status === "ERRO" && /bloqueio|captcha|antibot|login/.test(result.note ?? "") ? blockedInRow + 1 : 0;
      const changed = result.status === "OK" && Math.abs(result.price - entry.price) >= 0.01;
      log(`${index + 1}/${list.length} ${entry.sku ?? "-"} ${entry.competitor}: ${result.status}${result.price ? ` R$ ${result.price.toFixed(2)}` : ""}${changed ? ` (era R$ ${entry.price.toFixed(2)})` : ""}${result.note ? ` — ${result.note}` : ""}`);
      results.push({ id: entry.id, status: result.status, ...(result.price ? { price: result.price } : {}) });
      if (blockedInRow < 5) await sleep(isShopee ? 20000 : 3000 + Math.random() * 2000);
    }
  } finally {
    await tab.close();
  }

  if (dryRun) { log("Simulação: nada enviado."); return; }
  const summary = await fetch(`${BASE}/api/concorrentes/verificacao`, { method: "POST", headers, body: JSON.stringify({ results }) }).then((r) => r.json());
  log(`Enviado: ${JSON.stringify(summary)}`);
}

main().catch((error) => { log(`FALHA: ${error.message}`); process.exit(1); });
