import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;
const STORE_SOURCES = ["loja", "loja-encomenda"];
const MIN_PHOTOS = 5;

/**
 * Loja → Visão geral: o retrato da loja online com o que já existe no sistema —
 * vitrine (publicados, ocultos, em revisão de marca), pedidos que chegaram pela
 * loja, o que precisa de atenção e as próximas publicações da Divulgação.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const since = new Date(Date.now() - 30 * DAY);
  const [products, orders30, recentOrders, posts, settings] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, price: true, showInStore: true, brandReview: true, brandReviewDoc: true, imageUrl: true, extraImages: true, _count: { select: { competitors: true } } },
    }),
    prisma.quote.findMany({ where: { source: { in: STORE_SOURCES }, createdAt: { gte: since } }, select: { finalPrice: true, status: true } }),
    prisma.quote.findMany({
      where: { source: { in: STORE_SOURCES } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, code: true, customerName: true, productName: true, finalPrice: true, status: true, source: true, createdAt: true },
    }),
    prisma.instagramPost.findMany({
      where: { status: { in: ["DRAFT", "APPROVED"] }, OR: [{ scheduledAt: null }, { scheduledAt: { gte: new Date(Date.now() - DAY) } }] },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 5,
      select: { id: true, title: true, kind: true, status: true, scheduledAt: true },
    }),
    prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} }),
  ]);

  const photoCount = (product: (typeof products)[number]) => {
    let extras: unknown = [];
    try { extras = JSON.parse(product.extraImages); } catch { extras = []; }
    return (product.imageUrl ? 1 : 0) + (Array.isArray(extras) ? extras.filter(Boolean).length : 0);
  };
  const published = products.filter((product) => product.showInStore && product.brandReview === "DONE");
  const inReview = products.filter((product) => product.brandReview !== "DONE");
  const hidden = products.filter((product) => !product.showInStore && product.brandReview === "DONE");

  const attention = [
    ...inReview.map((product) => ({
      sku: product.sku, name: product.name, kind: "revisao" as const,
      text: product.brandReview === "PROPOSED" ? "Proposta de fotos e texto pronta para aprovar" : "Aguardando a revisão de marca (fotos e texto próprios)",
      link: product.brandReview === "PROPOSED" && product.brandReviewDoc ? product.brandReviewDoc : "/catalog",
    })),
    ...published.filter((product) => photoCount(product) < MIN_PHOTOS).map((product) => ({
      sku: product.sku, name: product.name, kind: "fotos" as const, text: `${photoCount(product)} de ${MIN_PHOTOS} fotos mínimas`, link: "/catalog",
    })),
    ...products.filter((product) => !product._count.competitors).map((product) => ({
      sku: product.sku, name: product.name, kind: "concorrencia" as const, text: "Sem pesquisa de preço de concorrente", link: "/catalog?aba=concorrencia",
    })),
  ];

  return NextResponse.json({
    counts: { published: published.length, hidden: hidden.length, inReview: inReview.length, active: products.length },
    orders30: {
      count: orders30.length,
      total: orders30.reduce((sum, order) => sum + order.finalPrice, 0),
      converted: orders30.filter((order) => order.status === "CONVERTED").length,
    },
    recentOrders,
    attention,
    posts,
    offers: {
      coupon: settings.storeCouponCode && settings.storeCouponPercent > 0 ? { code: settings.storeCouponCode, percent: settings.storeCouponPercent } : null,
      freeShippingMin: settings.storeFreeShippingMin,
      productionDays: settings.storeProductionDays,
    },
    hidden: hidden.map((product) => ({ sku: product.sku, name: product.name, price: product.price })),
  });
}
