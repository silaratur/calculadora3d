import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activePromoPercent, parseSizes } from "@/lib/promotions";
import { parseIds, productImagePath } from "@/lib/showcase";
import { notifyStore } from "@/lib/store-sync";

/**
 * Loja → Vitrine. GET: produtos da loja (ordem, destaque, selo, fotos), coleções
 * e banners. PUT: grava ordem/destaque/selo de vários produtos de uma vez.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const [products, collections, banners, settings] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, sku: true, name: true, category: true, description: true, price: true, colors: true, sizeOptions: true, promoPercent: true, promoLabel: true, promoStartsAt: true, promoEndsAt: true, showInStore: true, brandReview: true, storeFeatured: true, storeBadge: true, storeOrder: true, imageUrl: true, extraImages: true, updatedAt: true, createdAt: true },
    }),
    prisma.storeCollection.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.storeBanner.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} }),
  ]);
  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id, sku: product.sku, name: product.name, category: product.category, price: product.price,
      inStore: product.showInStore && product.brandReview === "DONE",
      storeFeatured: product.storeFeatured, storeBadge: product.storeBadge, storeOrder: product.storeOrder,
      createdAt: product.createdAt,
      // Para o "Criar post": texto, cores, tamanhos e a promoção que vale agora.
      description: product.description ?? "",
      colors: parseIds(product.colors),
      sizes: parseSizes(product.sizeOptions),
      promo: activePromoPercent(product) ? { percent: product.promoPercent, label: product.promoLabel } : null,
      // Miniaturas para o painel (fotos que o produto tem, na ordem).
      images: Array.from({ length: [product.imageUrl, ...parseIds(product.extraImages)].filter(Boolean).length }, (_, index) => productImagePath(product, index)).filter((path): path is string => Boolean(path)),
    })),
    collections: collections.map((collection) => ({ ...collection, productIds: parseIds(collection.productIds) })),
    banners,
    productionDays: settings.storeProductionDays,
  });
}

const itemsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    storeOrder: z.number().int().min(0).max(10000),
    storeFeatured: z.boolean(),
    storeBadge: z.string().trim().max(24),
  })).max(500),
});

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = itemsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Confira os selos (até 24 letras)." }, { status: 400 });
  await prisma.$transaction(parsed.data.items.map(({ id, ...data }) => prisma.product.update({ where: { id }, data })));
  notifyStore();
  return NextResponse.json({ updated: parsed.data.items.length });
}
