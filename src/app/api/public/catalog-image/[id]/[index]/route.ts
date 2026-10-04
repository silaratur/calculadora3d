import { prisma } from "@/lib/prisma";
import { validProductImageSignature } from "@/lib/signed-media";

/** Foto de um produto do Catálogo por link assinado (ver src/lib/signed-media.ts). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  const url = new URL(request.url);
  if (!validProductImageSignature(id, index, url.searchParams.get("exp"), url.searchParams.get("sig"))) return new Response("Not found", { status: 404 });
  const product = await prisma.product.findUnique({ where: { id }, select: { imageUrl: true, extraImages: true } });
  if (!product) return new Response("Not found", { status: 404 });
  let extra: string[] = [];
  try { extra = JSON.parse(product.extraImages || "[]") as string[]; } catch { extra = []; }
  const src = [product.imageUrl, ...extra].filter(Boolean)[Number(index)];
  if (!src) return new Response("Not found", { status: 404 });
  const match = src.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!match) return Response.redirect(new URL(src, request.url), 302);
  const [, mime, isBase64, data] = match;
  const bytes = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } });
}
