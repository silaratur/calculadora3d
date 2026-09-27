import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Vitrine pública (loja ac3d.silaratur.cloud) — sem login. Só produtos ativos
 * e marcados "Mostrar na loja" no Catálogo, e só campos que o cliente pode
 * ver: nada de custo, margem, material ou tempo de impressão.
 *
 * As fotos ficam no banco como data URI; em vez de mandar megabytes de base64
 * no JSON, cada uma vira um caminho relativo servido por
 * /api/public/products/[id]/image/[index] (o `?v=` muda quando o produto é
 * editado, então o navegador pode guardar a imagem em cache por muito tempo).
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Quantas peças da loja ganham a tarja "Mais vendido". */
const BEST_SELLERS = 3;

export async function GET() {
  const [products, sales] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, showInStore: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, sku: true, name: true, category: true, description: true, price: true, imageUrl: true, extraImages: true, colors: true, personalizable: true, createdAt: true, updatedAt: true },
    }),
    // Só o ranking sai daqui — as quantidades vendidas não são públicas.
    prisma.salesOrder.groupBy({ by: ["productId"], _sum: { quantity: true }, where: { productId: { not: null } } }),
  ]);
  const storeIds = new Set(products.map((product) => product.id));
  const bestSellers = new Set(
    sales
      .filter((row) => row.productId && storeIds.has(row.productId) && (row._sum.quantity ?? 0) > 0)
      .sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0))
      .slice(0, BEST_SELLERS)
      .map((row) => row.productId),
  );

  const body = products.map((product) => {
    const version = product.updatedAt.getTime();
    // Mesma ordem da rota de imagem (capa, depois extras). Foto em data URI vai
    // pela rota que decodifica; foto que já é arquivo (ex.: /catalogo/D.001.webp)
    // vai direto, sem passar pelo banco a cada visualização.
    const sources = [product.imageUrl, ...parseExtraImages(product.extraImages)].filter(Boolean);
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      description: product.description ?? "",
      price: product.price,
      colors: parseExtraImages(product.colors),
      personalizable: product.personalizable,
      bestSeller: bestSellers.has(product.id),
      // Usado pela loja para a seção de lançamentos.
      createdAt: product.createdAt.toISOString(),
      images: sources.map((src, index) => (src.startsWith("data:") ? `/api/public/products/${product.id}/image/${index}?v=${version}` : src)),
    };
  });

  return NextResponse.json(body, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=60" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** JSON array de textos (fotos extras, cores) — tolera valor corrompido. */
export function parseExtraImages(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}
