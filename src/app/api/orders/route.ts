import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateOrderMetrics } from "@/lib/costing";

const orderSchema = z.object({
  customerId: z.string().optional().nullable(),
  quoteId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  // Texto livre continua aceito para venda avulsa (sem cadastro no catálogo).
  productName: z.string().min(2).optional(),
  quantity: z.number().min(0.01),
  channelId: z.string().optional().nullable(),
  channel: z.string().min(2).optional(),
  unitPrice: z.number().min(0).optional(),
  discountPerUnit: z.number().min(0).optional(),
  marketplaceFee: z.number().min(0).optional(),
  shippingCost: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  paidAmount: z.number().min(0).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  plannedProductionDate: z.coerce.date().nullable().optional(),
  expectedPaymentDate: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  paidAmount: z.number().min(0).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  plannedProductionDate: z.coerce.date().nullable().optional(),
  expectedPaymentDate: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
});

async function authenticated() {
  return Boolean(await getCurrentUser());
}

/** AAAAMMDD no fuso local — evitar UTC aqui importa: perto da meia-noite no
 * Brasil (~21h em UTC-3) `toISOString()` já mostraria o dia seguinte. */
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** PED-AAAAMMDD-0001, sequencial por dia — não colide como o Math.random() antigo. */
async function nextOrderNumber() {
  const prefix = `PED-${localDateKey(new Date())}`;
  const last = await prisma.salesOrder.findFirst({
    where: { orderNumber: { startsWith: `${prefix}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastSeq = last ? Number(last.orderNumber.split("-").pop()) || 0 : 0;
  return `${prefix}-${String(lastSeq + 1).padStart(4, "0")}`;
}

type OrderInput = z.infer<typeof orderSchema>;

/**
 * Resolve produto/canal e calcula os valores congelados do pedido — usado
 * tanto ao criar quanto ao editar. `existing` é o pedido atual (só na edição):
 * sem ele, editar uma venda avulsa (sem produto do catálogo, então sem preço
 * pra puxar) zerava o valor sempre que o formulário não reenviava unitPrice.
 */
async function resolveOrderPricing(data: OrderInput, existing?: { unitPrice: number; unitCostSnapshot: number } | null) {
  const product = data.productId ? await prisma.product.findUnique({ where: { id: data.productId } }) : null;
  if (data.productId && !product) return { error: "Produto não encontrado" as const };

  const channel = data.channelId ? await prisma.marketplaceChannel.findUnique({ where: { id: data.channelId } }) : null;
  if (data.channelId && !channel) return { error: "Canal não encontrado" as const };

  const productName = product?.name ?? data.productName;
  if (!productName) return { error: "Informe o produto do catálogo ou um nome" as const };

  // Custo e preço do item ficam congelados no pedido: reprecificar o produto
  // depois não reescreve o histórico de vendas já feitas.
  const unitCostSnapshot = product?.cost ?? existing?.unitCostSnapshot ?? 0;
  const unitPrice = data.unitPrice ?? product?.price ?? existing?.unitPrice ?? 0;
  const printTimeHours = product?.printTimeHours ?? 0;
  const marketplaceFee = data.marketplaceFee ?? (channel ? unitPrice * channel.commissionRate : 0);

  const metrics = calculateOrderMetrics({
    quantity: data.quantity,
    unitPrice,
    unitCost: unitCostSnapshot,
    discountPerUnit: data.discountPerUnit ?? 0,
    marketplaceFee,
    shippingCost: data.shippingCost ?? 0,
    printTimeHours,
  });

  return {
    product,
    channel,
    productName,
    unitCostSnapshot,
    unitPrice,
    printTimeHours,
    marketplaceFee,
    metrics,
  };
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(
    await prisma.salesOrder.findMany({
      include: { customer: true, product: true, marketplace: true, production: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const resolved = await resolveOrderPricing(data);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const { product, channel, productName, unitCostSnapshot, unitPrice, printTimeHours, marketplaceFee, metrics } = resolved;

  const paidAmount = data.paidAmount ?? 0;
  const orderData = {
    customerId: data.customerId ?? null,
    quoteId: data.quoteId ?? null,
    productId: product?.id ?? null,
    productName,
    quantity: data.quantity,
    channel: channel?.name ?? data.channel ?? "Venda Direta",
    channelId: channel?.id ?? null,
    unitPrice,
    unitCostSnapshot,
    printTimeHours,
    discountPerUnit: data.discountPerUnit ?? 0,
    marketplaceFee,
    shippingCost: data.shippingCost ?? 0,
    paymentMethod: data.paymentMethod ?? "PIX",
    totalAmount: metrics.netRevenue,
    paidAmount,
    paymentStatus: paidAmount <= 0 ? "PENDING" : paidAmount >= metrics.netRevenue ? "PAID" : "PARTIAL",
    dueDate: data.dueDate ?? null,
    plannedProductionDate: data.plannedProductionDate ?? null,
    expectedPaymentDate: data.expectedPaymentDate ?? null,
    notes: data.notes ?? "",
  };

  // Número sequencial por dia: em uso concorrente (raro num app de um usuário
  // só) duas requisições podem ler o mesmo "último número" antes de gravar —
  // a constraint @unique pega isso, e aqui tentamos de novo com o próximo.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const order = await prisma.salesOrder.create({
        data: { ...orderData, orderNumber: await nextOrderNumber(), production: { create: { plannedMinutes: Math.round(metrics.totalPrintHours * 60) } } },
        include: { production: true, customer: true, product: true, marketplace: true },
      });
      return NextResponse.json({ order, metrics }, { status: 201 });
    } catch (error) {
      const isUniqueClash = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueClash || attempt === 2) throw error;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o número do pedido" }, { status: 500 });
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const body = await request.json();

  // Edição completa (produto, quantidade, canal, desconto...) vem do formulário
  // de Vendas; a atualização "leve" (status, pagamento, notas) vem da Produção
  // e das Pendências. Diferenciamos pela presença de `quantity`.
  const isFullEdit = typeof body === "object" && body !== null && "quantity" in body;

  if (!isFullEdit) {
    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await prisma.salesOrder.update({ where: { id }, data: parsed.data }));
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.salesOrder.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (existing.paidAmount > 0) {
    return NextResponse.json(
      { error: "Este pedido já tem recebimento registrado — não é possível editar produto, quantidade ou valores. Ajuste pelo Fluxo de Caixa se necessário." },
      { status: 409 },
    );
  }

  const resolved = await resolveOrderPricing(data, existing);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const { product, channel, productName, unitCostSnapshot, unitPrice, printTimeHours, marketplaceFee, metrics } = resolved;

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesOrder.update({
      where: { id },
      data: {
        customerId: data.customerId ?? null,
        productId: product?.id ?? null,
        productName,
        quantity: data.quantity,
        channel: channel?.name ?? data.channel ?? "Venda Direta",
        channelId: channel?.id ?? null,
        unitPrice,
        unitCostSnapshot,
        printTimeHours,
        discountPerUnit: data.discountPerUnit ?? 0,
        marketplaceFee,
        shippingCost: data.shippingCost ?? 0,
        paymentMethod: data.paymentMethod ?? existing.paymentMethod,
        totalAmount: metrics.netRevenue,
        dueDate: data.dueDate ?? existing.dueDate,
        plannedProductionDate: data.plannedProductionDate ?? existing.plannedProductionDate,
        expectedPaymentDate: data.expectedPaymentDate ?? existing.expectedPaymentDate,
      },
      include: { production: true, customer: true, product: true, marketplace: true },
    });
    // A peça pode ter mudado (produto/quantidade) — realinha o tempo planejado
    // na fila de produção, contanto que ela ainda não tenha começado.
    if (updated.production && updated.production.status === "WAITING") {
      const production = await tx.productionJob.update({ where: { orderId: id }, data: { plannedMinutes: Math.round(metrics.totalPrintHours * 60) } });
      // `updated` foi buscado antes desta escrita — sem isto o retorno da API
      // ecoaria o plannedMinutes antigo mesmo com o banco já correto.
      return { ...updated, production };
    }
    return updated;
  });

  return NextResponse.json({ order, metrics });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.productionJob.deleteMany({ where: { orderId: id } });
  await prisma.salesOrder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
