import type { StoreCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPercent, marginAt } from "@/lib/promotions";

// Loja → Plano de campanhas. Cada campanha guarda a "receita" (promoção % em
// peças, cupom, coleção e banner). Ativar liga tudo no período da campanha —
// promoção, cupom, coleção e banner já respeitam as datas, então ativar uma
// campanha futura só a deixa agendada. Pausar desliga só o que ela ligou.

type CouponSpec = { code: string; kind: "PERCENT" | "FIXED"; value: number; minOrder: number; maxUses?: number };
type CollectionSpec = { title: string; lead: string; tone: string; skus: string[] };
type BannerSpec = { title: string; subtitle: string; buttonLabel: string; sku: string; imageIndex: number };

const parse = <T,>(raw: string): T | null => { try { return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };
export const recipe = (campaign: StoreCampaign) => ({
  skus: parse<string[]>(campaign.productSkus) ?? [],
  coupon: parse<CouponSpec>(campaign.coupon),
  collection: parse<CollectionSpec>(campaign.collection),
  banner: parse<BannerSpec>(campaign.banner),
});

/** Situação para a tela: sugerida, agendada (ativa no futuro), no ar, pausada ou encerrada. */
export function campaignState(campaign: StoreCampaign, now = new Date()) {
  if (campaign.status === "PAUSED") return "pausada";
  if (campaign.status === "SUGGESTED") return campaign.endsAt < now ? "expirada" : "sugerida";
  if (campaign.endsAt < now) return "encerrada";
  return campaign.startsAt > now ? "agendada" : "no ar";
}

/** Prévia de margem de cada peça com a promoção (e, no pior caso, com o cupom %). */
export async function marginPreview(campaign: StoreCampaign) {
  const { skus, coupon, collection } = recipe(campaign);
  const all = [...new Set([...skus, ...(collection?.skus ?? [])])];
  const products = await prisma.product.findMany({ where: { sku: { in: all } }, select: { sku: true, name: true, price: true, cost: true, active: true, showInStore: true } });
  return products.map((product) => {
    const promo = skus.includes(product.sku) ? campaign.promoPercent : 0;
    const promoPrice = applyPercent(product.price, promo);
    const couponPrice = coupon?.kind === "PERCENT" ? applyPercent(promoPrice, coupon.value) : promoPrice;
    return {
      sku: product.sku, name: product.name, price: product.price, promoPrice, inStore: product.active && product.showInStore,
      margin: Math.round(marginAt(product.price, product.cost) * 10) / 10,
      marginPromo: Math.round(marginAt(promoPrice, product.cost) * 10) / 10,
      marginWorst: Math.round(marginAt(couponPrice, product.cost) * 10) / 10,
    };
  }).sort((a, b) => a.marginWorst - b.marginWorst);
}

export async function activateCampaign(id: string) {
  const campaign = await prisma.storeCampaign.findUniqueOrThrow({ where: { id } });
  const { skus, coupon, collection, banner } = recipe(campaign);

  // Peça em promoção de outra campanha ativa no mesmo período: não sobrescreve.
  if (campaign.promoPercent > 0 && skus.length) {
    const others = await prisma.storeCampaign.findMany({ where: { status: "ACTIVE", id: { not: id }, promoPercent: { gt: 0 }, startsAt: { lt: campaign.endsAt }, endsAt: { gt: campaign.startsAt } } });
    for (const other of others) {
      const clash = recipe(other).skus.filter((sku) => skus.includes(sku));
      if (clash.length) throw new Error(`As peças ${clash.join(", ")} já estão em promoção na campanha "${other.title}" no mesmo período. Pause aquela antes ou ative depois que ela terminar.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const data: Partial<StoreCampaign> = { status: "ACTIVE" };
    if (campaign.promoPercent > 0 && skus.length) {
      await tx.product.updateMany({ where: { sku: { in: skus } }, data: { promoPercent: campaign.promoPercent, promoLabel: campaign.promoLabel, promoStartsAt: campaign.startsAt, promoEndsAt: campaign.endsAt } });
    }
    if (coupon) {
      const fields = { kind: coupon.kind, value: coupon.value, minOrder: coupon.minOrder, maxUses: coupon.maxUses ?? null, startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: true, notes: `Campanha: ${campaign.title}` };
      const saved = await tx.coupon.upsert({ where: { code: coupon.code }, update: fields, create: { code: coupon.code, ...fields } });
      data.couponId = saved.id;
    }
    let collectionId = campaign.collectionId;
    if (collection) {
      const ids = (await tx.product.findMany({ where: { sku: { in: collection.skus } }, select: { id: true, sku: true } }));
      const ordered = collection.skus.map((sku) => ids.find((item) => item.sku === sku)?.id).filter(Boolean);
      const fields = { title: collection.title, lead: collection.lead, tone: collection.tone, startsAt: campaign.startsAt, endsAt: campaign.endsAt, productIds: JSON.stringify(ordered), active: true };
      const exists = collectionId ? await tx.storeCollection.findUnique({ where: { id: collectionId } }) : null;
      collectionId = exists ? (await tx.storeCollection.update({ where: { id: exists.id }, data: fields })).id : (await tx.storeCollection.create({ data: fields })).id;
      data.collectionId = collectionId;
    }
    if (banner) {
      const product = await tx.product.findFirst({ where: { sku: banner.sku }, select: { id: true } });
      const fields = {
        title: banner.title, subtitle: banner.subtitle, buttonLabel: banner.buttonLabel,
        target: collectionId ? `colecao:${collectionId}` : `produto:${banner.sku}`,
        productId: product?.id ?? null, imageIndex: banner.imageIndex, startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: true,
      };
      const exists = campaign.bannerId ? await tx.storeBanner.findUnique({ where: { id: campaign.bannerId } }) : null;
      data.bannerId = exists ? (await tx.storeBanner.update({ where: { id: exists.id }, data: fields })).id : (await tx.storeBanner.create({ data: fields })).id;
    }
    await tx.storeCampaign.update({ where: { id }, data });
  });
}

export async function pauseCampaign(id: string) {
  const campaign = await prisma.storeCampaign.findUniqueOrThrow({ where: { id } });
  const { skus } = recipe(campaign);
  await prisma.$transaction(async (tx) => {
    // Só tira a promoção que é desta campanha (mesmo nome), nunca a de outra.
    if (skus.length && campaign.promoLabel) {
      await tx.product.updateMany({ where: { sku: { in: skus }, promoLabel: campaign.promoLabel }, data: { promoPercent: 0, promoLabel: "", promoStartsAt: null, promoEndsAt: null } });
    }
    if (campaign.couponId) await tx.coupon.updateMany({ where: { id: campaign.couponId }, data: { active: false } });
    if (campaign.collectionId) await tx.storeCollection.updateMany({ where: { id: campaign.collectionId }, data: { active: false } });
    if (campaign.bannerId) await tx.storeBanner.updateMany({ where: { id: campaign.bannerId }, data: { active: false } });
    await tx.storeCampaign.update({ where: { id }, data: { status: "PAUSED" } });
  });
}
