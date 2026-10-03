import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Publicação no Instagram (@ac3d_studio) pela "API do Instagram com login do
 * Instagram" — app "AC3D Publicador" no Meta for Developers, em modo de
 * desenvolvimento, com a conta como Testador do Instagram. O token gerado no
 * painel da Meta vale 60 dias e é renovável (refreshInstagramToken) depois de
 * 24 h de vida.
 */
const GRAPH = "https://graph.instagram.com";
const TOKEN_LIFETIME_DAYS = 60;

// Cifra o token em repouso com uma chave derivada do JWT_SECRET: uma cópia
// do banco sozinha não basta para publicar na conta. Trocar o JWT_SECRET
// invalida o token salvo (basta colar de novo em Configurações).
function key() {
  return createHash("sha256").update(`instagram:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

function decrypt(stored: string) {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

type GraphError = { error?: { message?: string; code?: number } };

function graphMessage(response: Response, body: GraphError) {
  // 190 = token inválido, expirado ou revogado.
  if (body.error?.code === 190) return "Token inválido ou expirado. Gere um novo no painel da Meta.";
  return body.error?.message || `Instagram respondeu ${response.status}.`;
}

export async function graphGet<T>(path: string, params: Record<string, string>) {
  const url = `${GRAPH}${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || body.error) throw new Error(graphMessage(response, body));
  return body;
}

export async function graphPost<T>(path: string, params: Record<string, string>) {
  const response = await fetch(`${GRAPH}${path}`, { method: "POST", body: new URLSearchParams(params), cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || body.error) throw new Error(graphMessage(response, body));
  return body;
}

export async function fetchInstagramProfile(token: string) {
  return graphGet<{ user_id: string; username: string }>("/me", { fields: "user_id,username", access_token: token });
}

export async function refreshInstagramToken(token: string) {
  return graphGet<{ access_token: string; expires_in: number }>("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: token });
}

export async function getInstagramToken() {
  return (await getInstagramAccount())?.token ?? null;
}

/** Token decifrado + conta, para o publicador. null se não houver conexão válida. */
export async function getInstagramAccount() {
  const connection = await prisma.instagramConnection.findUnique({ where: { id: "default" } });
  if (!connection?.tokenCipher) return null;
  try {
    return { token: decrypt(connection.tokenCipher), igUserId: connection.igUserId, expiresAt: connection.tokenExpiresAt };
  } catch {
    return null;
  }
}

/**
 * Renova o token quando faltam menos de 15 dias (a Meta só aceita depois de
 * 24 h de vida). Chamado pelo agendador; falha aqui não para a publicação.
 */
export async function refreshInstagramTokenIfNeeded() {
  const account = await getInstagramAccount();
  if (!account?.expiresAt) return;
  const daysLeft = (account.expiresAt.getTime() - Date.now()) / 86400000;
  // Todo token (novo ou renovado) nasce com 60 dias: a idade sai da validade.
  const ageHours = (TOKEN_LIFETIME_DAYS - daysLeft) * 24;
  if (daysLeft > 15 || ageHours < 25) return;
  const refreshed = await refreshInstagramToken(account.token);
  await prisma.instagramConnection.update({
    where: { id: "default" },
    data: { tokenCipher: encrypt(refreshed.access_token), tokenHint: refreshed.access_token.slice(-4), tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000) },
  });
}

/** Endereço público do app (a Meta baixa as imagens por ele). Sem ele, não há publicação — é o caso do DEV. */
export function publicAppUrl() {
  return process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || null;
}

export function autopublishEnabled() {
  return process.env.INSTAGRAM_AUTOPUBLISH === "on" && Boolean(publicAppUrl());
}

/** Valida o token no Instagram antes de gravar — token errado não chega ao banco. */
export async function saveInstagramToken(token: string) {
  const profile = await fetchInstagramProfile(token);
  const data = {
    tokenCipher: encrypt(token),
    tokenHint: token.slice(-4),
    igUserId: String(profile.user_id),
    username: profile.username,
    tokenExpiresAt: new Date(Date.now() + TOKEN_LIFETIME_DAYS * 86400000),
    lastCheckedAt: new Date(),
  };
  await prisma.instagramConnection.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
}

/** O que a tela pode ver da conexão — nunca o token. */
export async function instagramStatus() {
  const connection = await prisma.instagramConnection.findUnique({ where: { id: "default" } });
  if (!connection?.tokenCipher) return { connected: false as const, canPublish: Boolean(publicAppUrl()), autopublish: autopublishEnabled() };
  return {
    connected: true as const,
    canPublish: Boolean(publicAppUrl()),
    autopublish: autopublishEnabled(),
    username: connection.username,
    igUserId: connection.igUserId,
    tokenHint: connection.tokenHint,
    tokenExpiresAt: connection.tokenExpiresAt,
    lastCheckedAt: connection.lastCheckedAt,
  };
}
