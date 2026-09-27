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

export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true, showInStore: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, sku: true, name: true, category: true, description: true, price: true, imageUrl: true, extraImages: true, createdAt: true, updatedAt: true },
  });

  const body = products.map((product) => {
    const version = product.updatedAt.getTime();
    const imageCount = (product.imageUrl ? 1 : 0) + parseExtraImages(product.extraImages).length;
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      description: product.description ?? "",
      price: product.price,
      // Usado pela loja para a seção de lançamentos.
      createdAt: product.createdAt.toISOString(),
      images: Array.from({ length: imageCount }, (_, index) => `/api/public/products/${product.id}/image/${index}?v=${version}`),
    };
  });

  return NextResponse.json(body, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=60" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function parseExtraImages(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}
