import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Imagens dos posts da Divulgação. Ficam em disco, ao lado do banco (em
 * produção, /opt/calculadora3d/data/instagram-media — fora do que o deploy
 * sobrescreve), uma pasta por post. A Meta baixa cada imagem por URL pública
 * (/api/public/instagram-media/<post>/<arquivo>) na hora de publicar.
 */
function mediaRoot() {
  if (process.env.INSTAGRAM_MEDIA_DIR) return process.env.INSTAGRAM_MEDIA_DIR;
  // DATABASE_URL relativo (file:./dev.db) é resolvido pelo Prisma a partir da pasta prisma/.
  const dbFile = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
  const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(process.cwd(), "prisma", dbFile);
  return path.join(path.dirname(dbPath), "instagram-media");
}

const SAFE_NAME = /^[a-z0-9]+\.(jpg|mp4)$/;
const SAFE_ID = /^[a-z0-9]+$/;

function postDir(postId: string) {
  if (!SAFE_ID.test(postId)) throw new Error("Post inválido.");
  return path.join(mediaRoot(), postId);
}

export const isVideoName = (name: string) => name.endsWith(".mp4");
export const mediaContentType = (name: string) => (isVideoName(name) ? "video/mp4" : "image/jpeg");

/**
 * Recebe um data URI JPEG (a tela já converte e reduz) ou MP4 (reel) e devolve
 * o nome do arquivo salvo.
 */
export async function saveMedia(postId: string, dataUri: string) {
  const match = /^data:(image\/jpeg|video\/mp4);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!match) throw new Error("Use imagem JPEG ou vídeo MP4.");
  const video = match[1] === "video/mp4";
  const buffer = Buffer.from(match[2], "base64");
  // Instagram: imagem até 8 MB; reel até 300 MB (aqui limitamos a 100 MB pelo envio da tela).
  if (!video && buffer.length > 8 * 1024 * 1024) throw new Error("Imagem maior que 8 MB.");
  if (video && buffer.length > 100 * 1024 * 1024) throw new Error("Vídeo maior que 100 MB.");
  const name = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}.${video ? "mp4" : "jpg"}`;
  const dir = postDir(postId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);
  return name;
}

export async function readMedia(postId: string, name: string) {
  if (!SAFE_NAME.test(name)) return null;
  try {
    return await readFile(path.join(postDir(postId), name));
  } catch {
    return null;
  }
}

/** Apaga os arquivos que não estão mais na lista (ou todos, sem lista). */
export async function pruneMedia(postId: string, keep: string[] = []) {
  const dir = postDir(postId);
  const files = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(files.filter((file) => !keep.includes(file)).map((file) => rm(path.join(dir, file), { force: true })));
  if (!keep.length) await rm(dir, { recursive: true, force: true });
}

export function parseMedia(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && SAFE_NAME.test(item)) : [];
  } catch {
    return [];
  }
}
