import type { StoreCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPercent, marginAt } from "@/lib/promotions";

// Loja → Plano de campanhas. Cada campanha guarda a "receita" (promoção % em
// peças, cupom, coleção e banner). Ativar liga tudo no período da campanha —
// cupom, coleção e banner já respeitam as datas, então ativar uma campanha
// futura só a deixa agendada. Pausar desliga só o que ela ligou.
//
// Promoção: cada peça tem UM campo de promoção. Por isso ela não é gravada ao
// ativar; syncCampaignPromos() escolhe, peça a peça, a campanha que vale agora
// (empate no período → maior %) ou a próxima que vai começar, e roda ao
// ativar/pausar e a cada 10 min no servidor. Promoção manual (nome que não é
// de nenhuma campanha) nunca é tocada.

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
  const { coupon, collection, banner } = recipe(campaign);

  await prisma.$transaction(async (tx) => {
    const data: Partial<StoreCampaign> = { status: "ACTIVE" };
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
  await syncCampaignPromos();
}

export async function pauseCampaign(id: string) {
  const campaign = await prisma.storeCampaign.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    if (campaign.couponId) await tx.coupon.updateMany({ where: { id: campaign.couponId }, data: { active: false } });
    if (campaign.collectionId) await tx.storeCollection.updateMany({ where: { id: campaign.collectionId }, data: { active: false } });
    if (campaign.bannerId) await tx.storeBanner.updateMany({ where: { id: campaign.bannerId }, data: { active: false } });
    await tx.storeCampaign.update({ where: { id }, data: { status: "PAUSED" } });
  });
  await syncCampaignPromos();
}

/**
 * Põe em cada peça a promoção da campanha que vale agora (se duas valem ao mesmo
 * tempo, a de maior %) ou, se nenhuma vale ainda, a da próxima que começa — o
 * período gravado faz a loja só mostrar o desconto na hora certa. Quando a
 * campanha acaba, a próxima assume na volta seguinte. Devolve quantas peças mudaram.
 */
export async function syncCampaignPromos(now = new Date()) {
  const campaigns = await prisma.storeCampaign.findMany({ where: { promoPercent: { gt: 0 } } });
  const labels = new Set(campaigns.map((campaign) => campaign.promoLabel).filter(Boolean));
  const live = campaigns.filter((campaign) => campaign.status === "ACTIVE" && campaign.endsAt > now);
  const bySku = new Map<string, StoreCampaign[]>();
  for (const campaign of live) for (const sku of recipe(campaign).skus) bySku.set(sku, [...(bySku.get(sku) ?? []), campaign]);
  const products = await prisma.product.findMany({
    where: { OR: [{ sku: { in: [...bySku.keys()] } }, { promoLabel: { in: [...labels] } }] },
    select: { id: true, sku: true, promoPercent: true, promoLabel: true, promoStartsAt: true, promoEndsAt: true },
  });
  let changed = 0;
  for (const product of products) {
    // Promoção manual (Loja → Promoções) com outro nome: não mexe.
    if (product.promoLabel && !labels.has(product.promoLabel) && product.promoPercent > 0) continue;
    const options = bySku.get(product.sku) ?? [];
    const current = options.filter((campaign) => campaign.startsAt <= now).sort((a, b) => b.promoPercent - a.promoPercent)[0];
    const next = options.filter((campaign) => campaign.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const pick = current ?? next;
    // Grava até a próxima troca: fim da campanha atual ou início de outra que dê mais desconto antes disso.
    let endsAt = pick?.endsAt ?? null;
    if (pick && current) {
      const better = options.filter((campaign) => campaign.startsAt > now && campaign.promoPercent > pick.promoPercent && campaign.startsAt < pick.endsAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      if (better) endsAt = better.startsAt;
    }
    const target = pick
      ? { promoPercent: pick.promoPercent, promoLabel: pick.promoLabel, promoStartsAt: pick.startsAt, promoEndsAt: endsAt }
      : { promoPercent: 0, promoLabel: "", promoStartsAt: null, promoEndsAt: null };
    const same = product.promoPercent === target.promoPercent && product.promoLabel === target.promoLabel
      && (product.promoStartsAt?.getTime() ?? null) === (target.promoStartsAt?.getTime() ?? null)
      && (product.promoEndsAt?.getTime() ?? null) === (target.promoEndsAt?.getTime() ?? null);
    if (same) continue;
    await prisma.product.update({ where: { id: product.id }, data: target });
    changed += 1;
  }
  return changed;
}
