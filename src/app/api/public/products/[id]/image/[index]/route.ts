import { prisma } from "@/lib/prisma";
import { corsHeaders, parseExtraImages } from "../../../route";

/** Foto de um produto da vitrine pública, decodificada do data URI salvo no banco. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  const product = await prisma.product.findFirst({
    where: { id, active: true, showInStore: true },
    select: { imageUrl: true, extraImages: true },
  });
  if (!product) return new Response("Not found", { status: 404, headers: corsHeaders });

  // Mesma ordem do Catálogo: capa primeiro, depois as extras.
  const images = [product.imageUrl, ...parseExtraImages(product.extraImages)].filter(Boolean);
  const src = images[Number(index)];
  if (!src) return new Response("Not found", { status: 404, headers: corsHeaders });

  const match = src.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!match) {
    // Produtos antigos podem ter um caminho/URL em vez de data URI.
    return Response.redirect(new URL(src, request.url), 302);
  }
  const [, mime, isBase64, data] = match;
  const bytes = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
  return new Response(bytes, {
    headers: { ...corsHeaders, "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
