// Pesquisa de concorrentes na Shopee, por dois caminhos permitidos (sem
// contornar o antibot 90309999 que barra a navegação automática):
//
//   1) API oficial de Afiliados (precisa de %USERPROFILE%\.ac3d\shopee-afiliados.json):
//      node scripts/shopee-buscar.mjs --termo "ponteira lapis 3d" --termo "ponteira personalizada nome"
//
//   2) Modo assistido (sem credenciais): a pessoa busca e abre anúncios no Chrome
//      dedicado (porta 9333, já logado); o script só ESCUTA o JSON que a própria
//      página carrega (search_items e pdp/get_pc) — não navega, não clica.
//      node scripts/shopee-buscar.mjs --assistido [--minutos 20]
//
// Saída: %USERPROFILE%\.ac3d\shopee\<data>-<hora>.json (por itemId, sem repetição),
// com os materiais que não são 3D já marcados. Depois: folha de fotos, validação
// pela foto do Catálogo e cadastro (ver memória do método de concorrentes).
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { CREDENTIALS_FILE, loadCredentials, searchProducts } from "./shopee-afiliados.mjs";

const PORT = 9333;
const OUT_DIR = path.join(homedir(), ".ac3d", "shopee");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const values = (name) => args.flatMap((value, index) => (args[index - 1] === `--${name}` ? [value] : []));
const minutes = Number(values("minutos")[0] ?? 20);

// Título com material que não é impressão 3D (regra: só comparar com peça 3D).
const NOT_3D = /borracha|corti[çc]a|madeira|bambu|fibra natural|croch[eê]|cer[aâ]mica|resina|metal|a[çc]o inox|vidro|tecido|feltro|mdf|acr[ií]lico|silicone|porcelana|palha natural|vime/i;
const LOOKS_3D = /\b3d\b|impress[aã]o 3d|impresso em 3d|\bpla\b|\bpetg\b|filamento/i;

const found = new Map();
mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`);
const save = () => writeFileSync(outFile, JSON.stringify([...found.values()].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)), null, 2));
const brl = (value) => (value === null || value === undefined ? "—" : `R$ ${value.toFixed(2).replace(".", ",")}`);

function add(item, origin) {
  const current = found.get(item.itemId);
  const merged = { ...current, ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== undefined && value !== "")) };
  merged.origins = [...new Set([...(current?.origins ?? []), origin])];
  merged.notThreeD = NOT_3D.test(`${merged.name} ${merged.description ?? ""}`);
  merged.looks3d = LOOKS_3D.test(`${merged.name} ${merged.description ?? ""} ${merged.shop ?? ""}`);
  found.set(item.itemId, merged);
  if (!current) console.log(`${merged.notThreeD ? "  (não 3D) " : merged.looks3d ? "  [3D] " : "  "}${brl(merged.price)} · ${merged.sold ?? "?"} vendidos · ${merged.shop ?? "loja ?"} · ${merged.name}`);
}

async function viaApi(credentials, terms) {
  for (const term of terms) {
    console.log(`\nBusca: "${term}"`);
    for (let page = 1; page <= 2; page += 1) {
      const { items, hasNextPage } = await searchProducts(credentials, term, { page });
      for (const item of items) add(item, `api:${term}`);
      save();
      if (!hasNextPage) break;
      await sleep(1500);
    }
  }
}

/** Só escuta as abas da Shopee do Chrome dedicado (as que já existem e as que forem abertas). */
async function assisted() {
  const watching = new Set();
  const deadline = Date.now() + minutes * 60_000;
  console.log(`Modo assistido por ${minutes} min: busque e abra anúncios da Shopee no Chrome dedicado. Ctrl+C encerra.\nArquivo: ${outFile}`);

  function parseSearch(json) {
    for (const entry of json.items ?? []) {
      const card = entry.item_card_displayed_asset ?? {};
      const data = entry.item_data ?? {};
      const itemId = String(entry.item_basic?.itemid ?? data.itemid ?? entry.itemid ?? "");
      const shopId = String(entry.item_basic?.shopid ?? data.shopid ?? entry.shopid ?? "");
      if (!itemId) continue;
      const price = data.item_card_display_price?.price ?? entry.item_basic?.price;
      add({
        itemId, shopId,
        name: card.name ?? entry.item_basic?.name,
        price: price ? price / 100000 : null,
        sold: data.item_card_display_sold_count?.historical_sold_count ?? entry.item_basic?.historical_sold ?? null,
        location: card.shop_location ?? entry.item_basic?.shop_location,
        image: card.image ? `https://down-br.img.susercontent.com/file/${card.image}` : undefined,
        sponsored: Boolean(entry.adsid),
        url: `https://shopee.com.br/product/${shopId}/${itemId}`,
      }, "busca");
    }
  }

  function parseItem(json) {
    const item = json.data?.item;
    if (!item) return;
    const prices = [item.price, ...(item.models ?? []).map((model) => model.price)].filter(Boolean).map((value) => value / 100000);
    add({
      itemId: String(item.item_id ?? item.itemid), shopId: String(item.shop_id ?? item.shopid),
      name: item.title ?? item.name, price: item.price ? item.price / 100000 : null,
      priceMin: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null,
      variations: (item.models ?? []).map((model) => ({ name: model.name, price: model.price / 100000 })),
      description: item.description, shop: json.data?.shop_detailed?.name,
      url: `https://shopee.com.br/product/${item.shop_id ?? item.shopid}/${item.item_id ?? item.itemid}`,
    }, "anúncio");
  }

  async function watch(target) {
    watching.add(target.id);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; }).catch(() => null);
    let nextId = 1;
    const pending = new Map();
    const tracked = new Map();
    const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); return; }
      if (message.method === "Network.responseReceived") {
        const url = message.params.response.url;
        if (/\/api\/v4\/search\/search_items/.test(url)) tracked.set(message.params.requestId, "search");
        else if (/\/api\/v4\/pdp\/get_pc/.test(url)) tracked.set(message.params.requestId, "item");
      }
      if (message.method === "Network.loadingFinished" && tracked.has(message.params.requestId)) {
        const kind = tracked.get(message.params.requestId);
        tracked.delete(message.params.requestId);
        const response = await send("Network.getResponseBody", { requestId: message.params.requestId });
        try {
          const json = JSON.parse(response.result?.body ?? "null");
          if (json?.error === 90309999) { console.log("  A Shopee pediu verificação nesta aba — resolva na própria janela e continue."); return; }
          if (kind === "search") parseSearch(json); else parseItem(json);
          save();
        } catch { /* resposta que não é JSON: ignora */ }
      }
    };
    ws.onclose = () => watching.delete(target.id);
    await send("Network.enable");
  }

  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => null);
    if (!targets) { console.log("Chrome dedicado não está aberto na porta 9333."); return; }
    for (const target of targets) if (target.type === "page" && !watching.has(target.id)) await watch(target).catch(() => watching.delete(target.id));
    await sleep(2000);
  }
}

const terms = values("termo");
if (args.includes("--assistido")) {
  process.on("SIGINT", () => { save(); console.log(`\n${found.size} anúncios salvos em ${outFile}`); process.exit(0); });
  await assisted();
} else if (terms.length) {
  const credentials = loadCredentials();
  if (!credentials) { console.log(`Sem credenciais da API de afiliados em ${CREDENTIALS_FILE}. Use --assistido ou cadastre o App ID e o Secret.`); process.exit(1); }
  await viaApi(credentials, terms);
} else {
  console.log('Uso: --termo "<busca>" (API de afiliados) ou --assistido [--minutos N]');
  process.exit(1);
}
save();
const list = [...found.values()];
console.log(`\n${list.length} anúncios (${list.filter((item) => item.looks3d && !item.notThreeD).length} com sinal de 3D, ${list.filter((item) => item.notThreeD).length} descartáveis) → ${outFile}`);
// As abas escutadas mantêm conexões abertas; encerra explicitamente.
process.exit(0);
