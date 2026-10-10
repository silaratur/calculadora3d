// Cliente da API oficial de Afiliados da Shopee (GraphQL), o caminho permitido
// para ler preços da Shopee sem abrir páginas — a navegação automática cai no
// antibot 90309999, que não contornamos.
//
// Credenciais (App ID e Secret do painel affiliate.shopee.com.br → Open API) em
// %USERPROFILE%\.ac3d\shopee-afiliados.json: { "appId": "...", "secret": "..." }
// Assinatura: SHA256(appId + timestamp + corpo + secret), no cabeçalho
// "Authorization: SHA256 Credential=<appId>, Timestamp=<ts>, Signature=<hash>".
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
export const CREDENTIALS_FILE = path.join(homedir(), ".ac3d", "shopee-afiliados.json");

export function loadCredentials() {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
    return parsed.appId && parsed.secret ? { appId: String(parsed.appId), secret: String(parsed.secret) } : null;
  } catch {
    return null;
  }
}

async function graphql(credentials, query) {
  const body = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256").update(`${credentials.appId}${timestamp}${body}${credentials.secret}`).digest("hex");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${credentials.appId}, Timestamp=${timestamp}, Signature=${signature}` },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) throw new Error(`API Shopee HTTP ${response.status}`);
  if (json.errors?.length) throw new Error(`API Shopee: ${json.errors.map((error) => error.message).join("; ")}`);
  return json.data;
}

const FIELDS = "itemId shopId productName shopName price priceMin priceMax sales ratingStar imageUrl productLink offerLink";

/** Ids do anúncio a partir do link (…-i.<loja>.<item> ou /product/<loja>/<item>). */
export function shopeeIds(url) {
  const match = url.match(/-i\.(\d+)\.(\d+)/) ?? url.match(/\/product\/(\d+)\/(\d+)/);
  return match ? { shopId: match[1], itemId: match[2] } : null;
}

const num = (value) => (value === null || value === undefined || value === "" ? null : Number(value));
const normalize = (node) => ({
  itemId: String(node.itemId),
  shopId: String(node.shopId),
  name: node.productName,
  shop: node.shopName,
  price: num(node.price) ?? num(node.priceMin),
  priceMin: num(node.priceMin),
  priceMax: num(node.priceMax),
  sold: num(node.sales),
  rating: num(node.ratingStar),
  image: node.imageUrl,
  url: node.productLink || `https://shopee.com.br/product/${node.shopId}/${node.itemId}`,
});

/** Um anúncio pelo itemId; null = não está mais na Shopee (ou fora do programa de afiliados). */
export async function productById(credentials, itemId) {
  const data = await graphql(credentials, `{ productOfferV2(itemId: ${Number(itemId)}, limit: 1) { nodes { ${FIELDS} } } }`);
  const node = data?.productOfferV2?.nodes?.[0];
  return node ? normalize(node) : null;
}

/** Busca por palavra-chave (sortType 2 = mais vendidos). */
export async function searchProducts(credentials, keyword, { page = 1, limit = 50, sortType = 2 } = {}) {
  const data = await graphql(credentials, `{ productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: ${sortType}, page: ${page}, limit: ${limit}) { nodes { ${FIELDS} } pageInfo { page limit hasNextPage } } }`);
  return { items: (data?.productOfferV2?.nodes ?? []).map(normalize), hasNextPage: Boolean(data?.productOfferV2?.pageInfo?.hasNextPage) };
}
