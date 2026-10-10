import { NextResponse } from "next/server";
import { z } from "zod";
import { nextSharedCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { resolveColorLine } from "@/lib/color-variants";
import { activePromoPercent, applyPercent, couponDiscount, couponProblem, parseSizes } from "@/lib/promotions";

/**
 * Pedido feito na loja (ac3d.silaratur.cloud) vira um Orçamento "Em aberto"
 * aqui, com o mesmo código ORC do dia — o cliente manda esse número no
 * WhatsApp e o pedido já está no sistema.
 *
 * Só o servidor da loja chama isto (cabeçalho x-store-key = STORE_API_KEY nos
 * dois .env); o navegador do cliente nunca fala direto com esta rota. Preços,
 * descontos e cupom são recalculados aqui a partir do Catálogo — o que vem da
 * loja é só SKU, quantidade, tamanho, cor e personalização. Ordem dos
 * descontos: preço do tamanho → promoção → quantidade → cupom (lib/promotions).
 */
// Texto do cliente nunca derruba o pedido: null vira vazio e o excesso é
// cortado (antes, um campo fora do limite recusava tudo e a loja seguia só pelo
// WhatsApp — o orçamento não chegava aqui).
const text = (max: number) =>
  z.preprocess((value) => (value == null ? undefined : typeof value === "string" ? value.trim().slice(0, max) : String(value).slice(0, max)), z.string().optional());

const itemSchema = z.object({
  sku: z.string().trim().min(1).max(20),
  qty: z.coerce.number().int().min(1).max(999).catch(1),
  color: text(30),
  size: text(40),
  personalization: text(60),
});

const orderSchema = z.object({
  kind: z.enum(["cart", "custom"]).default("cart"),
  customerName: text(80),
  customerPhone: text(30),
  // Validado depois: e-mail que não passa vai para as observações em vez de recusar o pedido.
  customerEmail: text(120),
  city: text(80),
  delivery: z.enum(["retirada", "entrega", "combinar"]).optional().catch(undefined),
  neededBy: text(20),
  // Canal que trouxe o cliente à loja (utm_source, site de origem ou app).
  channel: text(60),
  notes: text(2000),
  coupon: text(30),
  items: z.array(itemSchema).max(50).default([]),
  custom: z
    .object({
      occasion: z.preprocess((value) => (typeof value === "string" && value.trim().length >= 2 ? value.trim().slice(0, 60) : "Outra ocasião"), z.string()),
      eventDate: text(20),
      quantity: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
      details: text(2000),
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
  if (!parsed.success) {
    console.error("[pedido da loja] recusado:", JSON.stringify(z.flattenError(parsed.error)));
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const order = parsed.data;
  const typedEmail = order.customerEmail ?? "";
  const emailOk = !typedEmail || z.email().safeParse(typedEmail).success;
  if (!emailOk) order.notes = [order.notes, `E-mail informado (conferir): ${typedEmail}`].filter(Boolean).join("\n");

  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const validUntil = new Date(Date.now() + settings.quoteValidityDays * 24 * 60 * 60 * 1000);
  const received = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const customer = { customerName: order.customerName ?? "", customerPhone: order.customerPhone ?? "", customerEmail: emailOk ? typedEmail : "" };
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
    where: { sku: { in: order.items.map((item) => item.sku) }, active: true, showInStore: true, brandReview: "DONE" },
    include: { materials: true },
  });
  const materials = await prisma.material.findMany();
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const lines = order.items.filter((item) => bySku.has(item.sku));
  if (!lines.length) return NextResponse.json({ error: "Nenhuma peça da sacola está disponível" }, { status: 400 });

  // Desconto por quantidade conta a peça inteira (todas as cores juntas), igual à loja.
  const qtyBySku = new Map<string, number>();
  for (const line of lines) qtyBySku.set(line.sku, (qtyBySku.get(line.sku) ?? 0) + line.qty);

  const now = new Date();
  const priced = lines.map((line) => {
    const product = bySku.get(line.sku)!;
    // Tamanho que não existe mais (ou não informado) cai no primeiro da lista.
    const sizes = parseSizes(product.sizeOptions);
    const size = sizes.length ? sizes.find((option) => option.name === line.size) ?? sizes[0] : null;
    const base = size ? size.price : product.price;
    const promoPercent = activePromoPercent(product, now);
    const promoUnit = applyPercent(base, promoPercent);
    const percent = discountFor(qtyBySku.get(line.sku) ?? 0, settings.storeQtyDiscounts);
    const unit = applyPercent(promoUnit, percent);
    return { ...line, size: size?.name, product, base, promoPercent, promoUnit, percent, unit, total: cents(unit * line.qty) };
  });
  const subtotal = cents(priced.reduce((sum, line) => sum + line.base * line.qty, 0));
  const afterPromo = cents(priced.reduce((sum, line) => sum + line.promoUnit * line.qty, 0));
  const afterTiers = cents(priced.reduce((sum, line) => sum + line.total, 0));
  // Cupom da tabela (Loja → Promoções): vale se ativo, no período, com usos e acima da compra mínima.
  const couponRecord = order.coupon ? await prisma.coupon.findUnique({ where: { code: order.coupon.toUpperCase() } }) : null;
  const couponOk = Boolean(couponRecord) && !couponProblem(couponRecord!, afterTiers, now);
  const couponOff = couponOk ? couponDiscount(couponRecord!, afterTiers) : 0;
  const couponPercent = couponOk && couponRecord!.kind === "PERCENT" ? couponRecord!.value : 0;
  const total = cents(afterTiers - couponOff);
  // Uma linha por produto + cor no snapshot (formato da tela de Orçamentos):
  // a cor troca o filamento (mesmo tipo) e o custo real da linha; o preço é o
  // do Catálogo. Personalização segue nas observações.
  const byVariant = new Map<string, { sku: string; color: string; size: string; base: number; quantity: number }>();
  for (const line of priced) {
    const color = line.color ?? "";
    const size = line.size ?? "";
    const key = `${line.sku}|${size.toLowerCase()}|${color.toLowerCase()}`;
    const current = byVariant.get(key);
    byVariant.set(key, { sku: line.sku, color, size, base: line.base, quantity: (current?.quantity ?? 0) + line.qty });
  }
  const snapshotProducts = [...byVariant.values()].map(({ sku, color, size, base, quantity }) => {
    const product = bySku.get(sku)!;
    const resolved = resolveColorLine(product, color, materials);
    // O Catálogo só tem o custo do tamanho cadastrado; outro tamanho estima o
    // custo na mesma proporção do preço (Grande 44,90 / Pequena 37,90 → ×1,18).
    const sizeFactor = size && product.price > 0 ? base / product.price : 1;
    return {
      id: product.id,
      name: size ? `${product.name} (${size})` : product.name,
      quantity,
      unitCost: cents(resolved.unitCost * sizeFactor),
      // O editor de Orçamentos lê o tamanho e usa o preço dele (unitPrice = preço cheio do tamanho).
      ...(size ? { size } : {}),
      unitPrice: base,
      printTimeHours: product.printTimeHours,
      imageUrl: product.imageUrl.startsWith("data:") ? undefined : product.imageUrl,
      ...(color ? { color } : {}),
      ...(resolved.material ? { materialId: resolved.material.id } : {}),
    };
  });
  const baseCost = cents(snapshotProducts.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
  const notes = [
    `Pedido pela loja em ${received}.`,
    ...priced.map((line) => `• ${line.qty}x ${line.product.name} (${line.sku})${line.size ? ` — tamanho ${line.size}` : ""}${line.color ? ` — cor ${line.color}` : ""}${line.personalization ? ` — personalização: "${line.personalization}"` : ""} — ${line.unit.toFixed(2).replace(".", ",")}/un.${line.promoPercent ? ` (promoção ${line.product.promoLabel || ""} -${line.promoPercent}%)`.replace("  ", " ") : ""}${line.percent ? ` (quantidade -${line.percent}%)` : ""}`),
    couponOk ? `Cupom ${couponRecord!.code} (-${couponOff.toFixed(2).replace(".", ",")})` : "",
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
      // e os descontos da loja (promoção, quantidade, cupom e tamanho) como
      // abatimento — assim o orçamento abre com o mesmo valor que o cliente viu.
      markup: "0",
      pricingMethod: "markup",
      // Relativo ao preço cheio de cada tamanho (o editor parte dele): promoção,
      // quantidade e cupom viram o abatimento.
      discount: cents(subtotal - total).toFixed(2).replace(".", ","),
      calculations: { price: total, subtotal, afterPromo, afterTiers, couponPercent, couponOff, coupon: couponOk ? couponRecord!.code : "", costWithReserve: baseCost, profit: cents(total - baseCost) },
      storeLines: priced.map((line) => ({ sku: line.sku, qty: line.qty, size: line.size ?? "", color: line.color ?? "", personalization: line.personalization ?? "", base: line.base, promoPercent: line.promoPercent, unit: line.unit, percent: line.percent })),
    }),
    notes,
    validUntil,
    source: "loja",
    sourceDetail: channel,
  });
  // Conta o uso do cupom (limite de usos) — também nunca derruba o pedido já salvo.
  if (couponOk) await prisma.coupon.update({ where: { id: couponRecord!.id }, data: { uses: { increment: 1 } } }).catch(() => undefined);
  // O lead nunca derruba o pedido: se falhar, o orçamento já está salvo.
  await upsertLead(customer.customerName, customer.customerPhone, customer.customerEmail, quote.code).catch(() => undefined);
  return NextResponse.json({ code: quote.code, total, subtotal, couponPercent, couponOff }, { status: 201 });
}
