import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { couponStatus } from "@/lib/promotions";
import { parseIds, periodStatus, productImagePath } from "@/lib/showcase";
import { corsHeaders } from "../products/route";

/**
 * Informações comerciais que a loja pública mostra (sem login): os mesmos
 * textos do orçamento em PDF (prazo, pagamento, garantia), o prazo de produção
 * em dias úteis e as faixas de desconto por quantidade — tudo editado em
 * Configurações. Nada de custo interno sai daqui.
 */
export async function GET() {
  const [settings, testimonials, coupons, collections, banners, storeProducts] = await Promise.all([
    prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} }),
    prisma.testimonial.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, text: true, context: true } }),
    prisma.coupon.findMany({ where: { active: true } }),
    prisma.storeCollection.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { endsAt: "asc" }] }),
    prisma.storeBanner.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    // Só o que a vitrine mostra: coleções e banner nunca apontam para peça fora da loja.
    prisma.product.findMany({ where: { active: true, showInStore: true, brandReview: "DONE" }, select: { id: true, sku: true, imageUrl: true, extraImages: true, updatedAt: true } }),
  ]);
  const visible = new Map(storeProducts.map((product) => [product.id, product]));
  const now = new Date();
  // Coleções no período, com as peças que estão na loja (sem peça nenhuma, some).
  const liveCollections = collections
    .filter((collection) => periodStatus(collection, now) === "no ar")
    .map((collection) => ({ id: `colecao-${collection.id}`, title: collection.title, lead: collection.lead, tone: collection.tone, endsAt: collection.endsAt?.toISOString() ?? null, productIds: parseIds(collection.productIds).filter((id) => visible.has(id)) }))
    .filter((collection) => collection.productIds.length);
  // Banner: o mais recente no ar; a foto vem de um produto da loja.
  const bannerRow = banners.find((banner) => periodStatus(banner, now) === "no ar");
  const bannerProduct = bannerRow?.productId ? visible.get(bannerRow.productId) : undefined;
  const banner = bannerRow
    ? {
        id: bannerRow.id,
        title: bannerRow.title,
        subtitle: bannerRow.subtitle,
        buttonLabel: bannerRow.buttonLabel,
        // colecao:<id> vira a âncora da faixa na loja.
        target: bannerRow.target.startsWith("colecao:") ? `#colecao-${bannerRow.target.slice(8)}` : bannerRow.target,
        image: bannerProduct ? productImagePath(bannerProduct, bannerRow.imageIndex) : null,
      }
    : null;
  let qtyDiscounts: { minQty: number; percent: number }[] = [];
  try {
    const parsed: unknown = JSON.parse(settings.storeQtyDiscounts);
    if (Array.isArray(parsed)) {
      qtyDiscounts = parsed
        .filter((tier): tier is { minQty: number; percent: number } => typeof tier?.minQty === "number" && typeof tier?.percent === "number")
        .sort((a, b) => a.minQty - b.minQty);
    }
  } catch {
    // JSON inválido: loja sem desconto por quantidade.
  }
  return NextResponse.json(
    {
      companyName: settings.companyName,
      productionDays: settings.storeProductionDays,
      deliveryText: settings.quoteDeliveryText,
      paymentText: settings.quotePaymentText,
      warrantyText: settings.quoteWarrantyText,
      qtyDiscounts,
      freeShippingMin: settings.storeFreeShippingMin,
      shippingText: settings.storeShippingText,
      // Só avisa que existe cupom; o código é validado em /api/public/coupon.
      hasCoupon: coupons.some((coupon) => couponStatus(coupon) === "ativo"),
      testimonials,
      // Loja → Vitrine: com alguma coleção no ar, a loja usa só elas (senão, as automáticas por data).
      collections: liveCollections,
      banner,
    },
    { headers: { ...corsHeaders, "Cache-Control": "public, max-age=60" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
