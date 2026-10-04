import { brl } from "@/lib/money";

// Loja → Promoções: regras de preço promocional, tamanhos e cupons. A ordem dos
// descontos é sempre: preço (ou preço do tamanho) → promoção % → desconto por
// quantidade → cupom. A loja mostra o mesmo cálculo, mas quem decide é o
// servidor (/api/public/orders recalcula tudo a partir daqui).

export type SizeOption = { name: string; price: number };
export type PromoFields = { promoPercent: number; promoLabel: string; promoStartsAt: Date | null; promoEndsAt: Date | null };
export type CouponRecord = { code: string; kind: string; value: number; minOrder: number; startsAt: Date | null; endsAt: Date | null; maxUses: number | null; uses: number; active: boolean };
export type PromoStatus = "ativa" | "agendada" | "encerrada" | "sem";

export const cents = (value: number) => Math.round(value * 100) / 100;

/** sizeOptions do banco (JSON) → lista válida; lixo vira tamanho único. */
export function parseSizes(raw: string): SizeOption[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SizeOption => typeof item?.name === "string" && item.name.trim() !== "" && typeof item?.price === "number" && item.price > 0)
      .map((item) => ({ name: item.name.trim(), price: cents(item.price) }));
  } catch {
    return [];
  }
}

export function promoStatus(product: PromoFields, now = new Date()): PromoStatus {
  if (!(product.promoPercent > 0)) return "sem";
  if (product.promoEndsAt && product.promoEndsAt.getTime() <= now.getTime()) return "encerrada";
  if (product.promoStartsAt && product.promoStartsAt.getTime() > now.getTime()) return "agendada";
  return "ativa";
}

/** % de promoção que vale agora (0 fora do período). */
export const activePromoPercent = (product: PromoFields, now = new Date()) => (promoStatus(product, now) === "ativa" ? product.promoPercent : 0);

export const applyPercent = (price: number, percent: number) => cents(price * (1 - percent / 100));

/** Margem (%) de vender a `price` com custo `cost`. */
export const marginAt = (price: number, cost: number) => (price > 0 ? ((price - cost) / price) * 100 : -100);

export function couponStatus(coupon: CouponRecord, now = new Date()): "ativo" | "agendado" | "expirado" | "esgotado" | "pausado" {
  if (!coupon.active) return "pausado";
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) return "expirado";
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return "esgotado";
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) return "agendado";
  return "ativo";
}

/** Motivo para o cupom não valer neste total (texto para o cliente), ou null. */
export function couponProblem(coupon: CouponRecord, amount: number | null, now = new Date()): string | null {
  const status = couponStatus(coupon, now);
  if (status === "expirado") return "Este cupom já expirou.";
  if (status === "esgotado") return "Este cupom já atingiu o limite de usos.";
  if (status === "agendado") return "Este cupom ainda não começou a valer.";
  if (status === "pausado") return "Cupom não encontrado. Confira as letras e os números.";
  if (amount !== null && coupon.minOrder > 0 && amount < coupon.minOrder) return `Este cupom vale para pedidos a partir de ${brl(coupon.minOrder)}.`;
  return null;
}

/** Quanto o cupom abate de `amount` (fixo nunca passa do total). */
export const couponDiscount = (coupon: Pick<CouponRecord, "kind" | "value">, amount: number) =>
  cents(coupon.kind === "FIXED" ? Math.min(coupon.value, amount) : (amount * coupon.value) / 100);

export const couponLabel = (coupon: Pick<CouponRecord, "kind" | "value">) =>
  coupon.kind === "FIXED" ? `${brl(coupon.value)} de desconto` : `${String(coupon.value).replace(".", ",")}% de desconto`;
