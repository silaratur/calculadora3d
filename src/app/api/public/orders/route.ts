import { NextResponse } from "next/server";
import { z } from "zod";
import { nextSharedCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { resolveColorLine } from "@/lib/color-variants";

/**
 * Pedido feito na loja (ac3d.silaratur.cloud) vira um Orçamento "Em aberto"
 * aqui, com o mesmo código ORC do dia — o cliente manda esse número no
 * WhatsApp e o pedido já está no sistema.
 *
 * Só o servidor da loja chama isto (cabeçalho x-store-key = STORE_API_KEY nos
 * dois .env); o navegador do cliente nunca fala direto com esta rota. Preços,
 * descontos e cupom são recalculados aqui a partir do Catálogo — o que vem da
 * loja é só SKU, quantidade, cor e personalização.
 */
const itemSchema = z.object({
  sku: z.string().trim().min(1).max(20),
  qty: z.number().int().min(1).max(999),
  color: z.string().trim().max(30).optional(),
  personalization: z.string().trim().max(60).optional(),
});

const orderSchema = z.object({
  kind: z.enum(["cart", "custom"]).default("cart"),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerEmail: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  city: z.string().trim().max(80).optional(),
  delivery: z.enum(["retirada", "entrega", "combinar"]).optional(),
  neededBy: z.string().trim().max(20).optional(),
  // Canal que trouxe o cliente à loja (utm_source, site de origem ou app).
  channel: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
  coupon: z.string().trim().max(30).optional(),
  items: z.array(itemSchema).max(50).default([]),
  custom: z
    .object({
      occasion: z.string().trim().min(2).max(60),
      eventDate: z.string().trim().max(20).optional(),
      quantity: z.number().int().min(1).max(100000).optional(),
      details: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

const cents = (value: number) => Math.round(value * 100) / 100;

function discountFor(qty: number, raw: string) {
  try {
    const tiers = JSON.parse(raw) as { minQty: number; percent: number }[];
    return tiers.reduce((best, tier) => (qty >= tier.minQty ? Math.max(best, tier.percent) : best), 0);
  } catch {
    return 0;
  }
}

const deliveryLabel = { retirada: "Retirar no estúdio", entrega: "Receber em casa", combinar: "A combinar" } as const;

/** "2026-12-20" → "20/12/2026"; qualquer outra coisa passa como veio. */
const brDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value);

/**
 * Todo pedido da loja vira um lead em Clientes (achado pelos últimos 10
 * dígitos do telefone). Cliente que já existe ganha o e-mail se não tinha;
 * nada é apagado.
 */
async function upsertLead(name: string, phone: string, email: string, code: string | null) {
  const digits = phone.replace(/\D/g, "");
  if (!name || digits.length < 10) return;
  const customers = await prisma.customer.findMany({ select: { id: true, phone: true, email: true } });
  const existing = customers.find((customer) => customer.phone.replace(/\D/g, "").endsWith(digits.slice(-10)));
  if (existing) {
    if (email && !existing.email) await prisma.customer.update({ where: { id: existing.id }, data: { email } });
    return;
  }
  await prisma.customer.create({ data: { name, phone, email, notes: `Lead da loja online${code ? ` — primeiro pedido #${code.replace(/^ORC-/, "")}` : ""}.` } });
}

async function createQuote(data: Parameters<typeof prisma.quote.create>[0]["data"]) {
  // Mesmo tratamento de /api/quotes: código sequencial do dia, com nova tentativa se colidir.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.quote.create({ data: { ...data, code: await nextSharedCode() } });
    } catch (error) {
      const isUniqueClash = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueClash || attempt === 2) throw error;
    }
  }
  throw new Error("Não foi possível gerar o código do orçamento");
}

export async function POST(request: Request) {
  const key = process.env.STORE_API_KEY;
  if (!key) return NextResponse.json({ error: "Integração com a loja desativada" }, { status: 503 });
  if (request.headers.get("x-store-key") !== key) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const order = parsed.data;

  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const validUntil = new Date(Date.now() + settings.quoteValidityDays * 24 * 60 * 60 * 1000);
  const received = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const customer = { customerName: order.customerName ?? "", customerPhone: order.customerPhone ?? "", customerEmail: order.customerEmail ?? "" };
  const channel = order.channel || "direto";
  // Contato/entrega que o cliente preencheu na loja — entram nas observações.
  const contact = [
    order.city ? `Cidade/bairro: ${order.city}` : "",
    order.delivery ? `Entrega: ${deliveryLabel[order.delivery]}` : "",
    order.neededBy ? `Precisa até: ${brDate(order.neededBy)}` : "",
    `Chegou à loja via: ${channel}`,
  ].filter(Boolean);

  if (order.kind === "custom") {
    if (!order.custom) return NextResponse.json({ error: "Detalhes da encomenda obrigatórios" }, { status: 400 });
    const { occasion, eventDate, quantity, details } = order.custom;
    const notes = [
      `Encomenda pela loja (festas e empresas) em ${received}.`,
      `Ocasião: ${occasion}`,
      eventDate ? `Data do evento: ${eventDate}` : "",
      quantity ? `Quantidade: ${quantity}` : "",
      details ? `Detalhes: ${details}` : "",
      order.notes ? `Observações: ${order.notes}` : "",
      ...contact,
    ].filter(Boolean).join("\n");
    const quote = await createQuote({
      productName: `Encomenda: ${occasion}${quantity ? ` (${quantity} un.)` : ""}`,
      ...customer,
      status: "DRAFT",
      baseCost: 0,
      finalPrice: 0,
      margin: 0,
      snapshotJson: JSON.stringify({ origin: "loja-encomenda", request: order.custom }),
      notes,
      validUntil,
      source: "loja-encomenda",
      sourceDetail: channel,
    });
    await upsertLead(customer.customerName, customer.customerPhone, customer.customerEmail, quote.code).catch(() => undefined);
    return NextResponse.json({ code: quote.code }, { status: 201 });
  }

  if (!order.items.length) return NextResponse.json({ error: "Sacola vazia" }, { status: 400 });
  const products = await prisma.product.findMany({
    where: { sku: { in: order.items.map((item) => item.sku) }, active: true, showInStore: true },
    include: { materials: true },
  });
  const materials = await prisma.material.findMany();
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const lines = order.items.filter((item) => bySku.has(item.sku));
  if (!lines.length) return NextResponse.json({ error: "Nenhuma peça da sacola está disponível" }, { status: 400 });

  // Desconto por quantidade conta a peça inteira (todas as cores juntas), igual à loja.
  const qtyBySku = new Map<string, number>();
  for (const line of lines) qtyBySku.set(line.sku, (qtyBySku.get(line.sku) ?? 0) + line.qty);

  const priced = lines.map((line) => {
    const product = bySku.get(line.sku)!;
    const percent = discountFor(qtyBySku.get(line.sku) ?? 0, settings.storeQtyDiscounts);
    const unit = cents(product.price * (1 - percent / 100));
    return { ...line, product, percent, unit, total: cents(unit * line.qty) };
  });
  const subtotal = cents(priced.reduce((sum, line) => sum + line.product.price * line.qty, 0));
  const afterTiers = cents(priced.reduce((sum, line) => sum + line.total, 0));
  const couponOk = Boolean(order.coupon) && Boolean(settings.storeCouponCode) && settings.storeCouponPercent > 0 && order.coupon!.toUpperCase() === settings.storeCouponCode.toUpperCase();
  const couponPercent = couponOk ? settings.storeCouponPercent : 0;
  const total = cents(afterTiers * (1 - couponPercent / 100));
  // Uma linha por produto + cor no snapshot (formato da tela de Orçamentos):
  // a cor troca o filamento (mesmo tipo) e o custo real da linha; o preço é o
  // do Catálogo. Personalização segue nas observações.
  const byVariant = new Map<string, { sku: string; color: string; quantity: number }>();
  for (const line of priced) {
    const color = line.color ?? "";
    const key = `${line.sku}|${color.toLowerCase()}`;
    const current = byVariant.get(key);
    byVariant.set(key, { sku: line.sku, color, quantity: (current?.quantity ?? 0) + line.qty });
  }
  const snapshotProducts = [...byVariant.values()].map(({ sku, color, quantity }) => {
    const product = bySku.get(sku)!;
    const resolved = resolveColorLine(product, color, materials);
    return {
      id: product.id,
      name: product.name,
      quantity,
      unitCost: resolved.unitCost,
      printTimeHours: product.printTimeHours,
      imageUrl: product.imageUrl.startsWith("data:") ? undefined : product.imageUrl,
      ...(color ? { color } : {}),
      ...(resolved.material ? { materialId: resolved.material.id } : {}),
    };
  });
  const baseCost = cents(snapshotProducts.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
  const notes = [
    `Pedido pela loja em ${received}.`,
    ...priced.map((line) => `• ${line.qty}x ${line.product.name} (${line.sku})${line.color ? ` — cor ${line.color}` : ""}${line.personalization ? ` — personalização: "${line.personalization}"` : ""} — ${line.unit.toFixed(2).replace(".", ",")}/un.${line.percent ? ` (-${line.percent}%)` : ""}`),
    couponOk ? `Cupom ${settings.storeCouponCode} (-${couponPercent}%)` : "",
    order.notes ? `Observações do cliente: ${order.notes}` : "",
    ...contact,
  ].filter(Boolean).join("\n");

  const first = priced[0].product.name;
  const quote = await createQuote({
    productId: new Set(snapshotProducts.map((line) => line.id)).size === 1 ? snapshotProducts[0].id : null,
    productName: snapshotProducts.length === 1 ? first : `${first} + ${snapshotProducts.length - 1} ${snapshotProducts.length === 2 ? "item" : "itens"}`,
    ...customer,
    status: "DRAFT",
    baseCost,
    finalPrice: total,
    margin: cents(total - baseCost),
    snapshotJson: JSON.stringify({
      origin: "loja",
      products: snapshotProducts,
      // O editor de Orçamentos parte do preço do Catálogo e soma o markup do
      // orçamento por cima; o preço da loja já É o do Catálogo, então markup 0
      // e os descontos da loja (quantidade + cupom) como abatimento — assim o
      // orçamento abre com o mesmo valor que o cliente viu.
      markup: "0",
      pricingMethod: "markup",
      discount: cents(subtotal - total).toFixed(2).replace(".", ","),
      calculations: { price: total, subtotal, afterTiers, couponPercent, costWithReserve: baseCost, profit: cents(total - baseCost) },
      storeLines: priced.map((line) => ({ sku: line.sku, qty: line.qty, color: line.color ?? "", personalization: line.personalization ?? "", unit: line.unit, percent: line.percent })),
    }),
    notes,
    validUntil,
    source: "loja",
    sourceDetail: channel,
  });
  // O lead nunca derruba o pedido: se falhar, o orçamento já está salvo.
  await upsertLead(customer.customerName, customer.customerPhone, customer.customerEmail, quote.code).catch(() => undefined);
  return NextResponse.json({ code: quote.code, total, subtotal, couponPercent }, { status: 201 });
}
