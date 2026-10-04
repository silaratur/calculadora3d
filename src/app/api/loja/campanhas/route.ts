import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { couponStatus, promoStatus } from "@/lib/promotions";
import { periodStatus } from "@/lib/showcase";
import { campaignLabel, commercialDates } from "@/lib/store-analytics";

const DAY = 86_400_000;
/** Dia de Brasília (UTC-3) no formato AAAA-MM-DD. */
const localDay = (date: Date) => new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Loja → Campanhas: resultado da loja no período (medição própria + pedidos
 * reais que chegaram pela loja) e o calendário de coleções, banners,
 * promoções, cupons e posts do Instagram.
 * Atribuição simples por visita: a campanha recebe o pedido de toda visita que
 * passou por ela.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("dias")) || 30));
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const calendarFrom = new Date(now.getTime() - 14 * DAY);
  const calendarTo = new Date(now.getTime() + 90 * DAY);

  const [events, orders, products, collections, banners, coupons, posts] = await Promise.all([
    prisma.storeEvent.findMany({ where: { createdAt: { gte: since } }, select: { type: true, sessionId: true, productId: true, campaign: true, source: true, value: true, createdAt: true } }),
    prisma.quote.findMany({ where: { source: { in: ["loja", "loja-encomenda"] }, createdAt: { gte: since } }, select: { finalPrice: true, status: true } }),
    prisma.product.findMany({ where: { active: true }, select: { id: true, sku: true, name: true, promoPercent: true, promoLabel: true, promoStartsAt: true, promoEndsAt: true } }),
    prisma.storeCollection.findMany(),
    prisma.storeBanner.findMany(),
    prisma.coupon.findMany(),
    prisma.instagramPost.findMany({ where: { scheduledAt: { gte: calendarFrom, lte: calendarTo }, status: { not: "REJECTED" } }, select: { title: true, kind: true, status: true, scheduledAt: true } }),
  ]);

  // ---------- Tráfego e funil (por visita)
  const sessions = new Map<string, { source: string; types: Set<string>; campaigns: Set<string>; day: string }>();
  for (const event of events) {
    const session = sessions.get(event.sessionId) ?? { source: event.source || "direto", types: new Set<string>(), campaigns: new Set<string>(), day: localDay(event.createdAt) };
    session.types.add(event.type);
    if (event.campaign) session.campaigns.add(event.campaign);
    sessions.set(event.sessionId, session);
  }
  const all = [...sessions.values()];
  const count = (type: string) => all.filter((session) => session.types.has(type)).length;
  const traffic = {
    visits: all.length,
    viewedProduct: count("view_item"),
    addedToCart: count("add_to_cart"),
    leads: count("generate_lead"),
    productViews: events.filter((event) => event.type === "view_item").length,
  };

  const daily = Array.from({ length: days }, (_, index) => {
    const date = localDay(new Date(now.getTime() - (days - 1 - index) * DAY));
    const ofDay = all.filter((session) => session.day === date);
    return { date, visits: ofDay.length, leads: ofDay.filter((session) => session.types.has("generate_lead")).length };
  });

  const sourceMap = new Map<string, { visits: number; leads: number }>();
  for (const session of all) {
    const row = sourceMap.get(session.source) ?? { visits: 0, leads: 0 };
    row.visits += 1;
    if (session.types.has("generate_lead")) row.leads += 1;
    sourceMap.set(session.source, row);
  }
  const sources = [...sourceMap.entries()].map(([source, row]) => ({ source, ...row })).sort((a, b) => b.visits - a.visits).slice(0, 8);

  // ---------- Peças mais vistas
  const byProduct = new Map(products.map((product) => [product.id, product]));
  const productStats = new Map<string, { views: number; adds: number }>();
  for (const event of events) {
    if (!event.productId || (event.type !== "view_item" && event.type !== "add_to_cart")) continue;
    const row = productStats.get(event.productId) ?? { views: 0, adds: 0 };
    if (event.type === "view_item") row.views += 1; else row.adds += 1;
    productStats.set(event.productId, row);
  }
  const topProducts = [...productStats.entries()]
    .flatMap(([id, row]) => (byProduct.get(id) ? [{ sku: byProduct.get(id)!.sku, name: byProduct.get(id)!.name, ...row }] : []))
    .sort((a, b) => b.views - a.views || b.adds - a.adds)
    .slice(0, 10);

  // ---------- Resultado por campanha (atribuição por visita)
  const names = { collections: new Map(collections.map((item) => [item.id, item.title])), banners: new Map(banners.map((item) => [item.id, item.title])) };
  const campaignMap = new Map<string, { visits: number; views: number; adds: number; leads: number }>();
  for (const session of all) {
    for (const key of session.campaigns) {
      const row = campaignMap.get(key) ?? { visits: 0, views: 0, adds: 0, leads: 0 };
      row.visits += 1;
      if (session.types.has("generate_lead")) row.leads += 1;
      campaignMap.set(key, row);
    }
  }
  for (const event of events) {
    if (!event.campaign) continue;
    const row = campaignMap.get(event.campaign);
    if (!row) continue;
    if (event.type === "view_item") row.views += 1;
    if (event.type === "add_to_cart") row.adds += 1;
  }
  const campaigns = [...campaignMap.entries()].map(([key, row]) => ({ key, label: campaignLabel(key, names), ...row })).sort((a, b) => b.visits - a.visits);

  // ---------- Calendário
  const clamp = (date: Date | null, fallback: Date) => (date ?? fallback).toISOString();
  const promoGroups = new Map<string, { label: string; percent: number; start: Date | null; end: Date | null; count: number; status: string }>();
  for (const product of products) {
    const status = promoStatus(product, now);
    if (status === "sem") continue;
    const key = `${product.promoLabel}|${product.promoPercent}|${product.promoStartsAt?.getTime() ?? ""}|${product.promoEndsAt?.getTime() ?? ""}`;
    const group = promoGroups.get(key) ?? { label: product.promoLabel || "Promoção", percent: product.promoPercent, start: product.promoStartsAt, end: product.promoEndsAt, count: 0, status };
    group.count += 1;
    promoGroups.set(key, group);
  }
  const calendar = {
    from: calendarFrom.toISOString(),
    to: calendarTo.toISOString(),
    items: [
      ...banners.map((item) => ({ kind: "banner", label: item.title, start: clamp(item.startsAt, item.createdAt), end: clamp(item.endsAt, calendarTo), status: periodStatus(item, now), detail: "Banner da abertura" })),
      ...collections.map((item) => ({ kind: "colecao", label: item.title, start: clamp(item.startsAt, item.createdAt), end: clamp(item.endsAt, calendarTo), status: periodStatus(item, now), detail: "Coleção" })),
      ...[...promoGroups.values()].map((group) => ({ kind: "promocao", label: `${group.label} -${String(group.percent).replace(".", ",")}%`, start: clamp(group.start, calendarFrom), end: clamp(group.end, calendarTo), status: group.status, detail: `${group.count} peça(s) em promoção` })),
      ...coupons.map((coupon) => ({ kind: "cupom", label: `Cupom ${coupon.code}`, start: clamp(coupon.startsAt, coupon.createdAt), end: clamp(coupon.endsAt, calendarTo), status: couponStatus(coupon, now), detail: `${coupon.uses} uso(s)` })),
    ].filter((item) => new Date(item.end) >= calendarFrom && new Date(item.start) <= calendarTo),
    posts: posts.flatMap((post) => (post.scheduledAt ? [{ date: post.scheduledAt.toISOString(), title: post.title, kind: post.kind, status: post.status }] : [])),
    dates: commercialDates(calendarFrom, calendarTo).map((item) => ({ date: item.date.toISOString(), label: item.label })),
  };

  return NextResponse.json({
    days,
    traffic,
    daily,
    orders: { count: orders.length, total: orders.reduce((sum, order) => sum + order.finalPrice, 0), converted: orders.filter((order) => order.status === "CONVERTED").length },
    sources,
    topProducts,
    campaigns,
    calendar,
    measuringSince: (await prisma.storeEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }))?.createdAt ?? null,
  });
}
