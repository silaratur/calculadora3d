import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildProductionItemDrafts } from "@/lib/production";
import { orderNumberForQuote } from "@/lib/codes";
import { quoteRealCost } from "@/lib/quotes";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

// Dados que só a venda tem e o orçamento não sabia na hora de ser feito —
// preenchidos no popup de conversão (Projetos → Converter em Venda). Cliente,
// canal e desconto vêm todos do orçamento; não dá pra sobrescrever aqui.
const convertSchema = z.object({
  shippingCost: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  plannedProductionDate: z.coerce.date().nullable().optional(),
  expectedPaymentDate: z.coerce.date().nullable().optional(),
});

// Um orçamento salvo pela calculadora vira um pedido real: o preço final e o
// custo base já foram calculados lá, então isto só transcreve os números —
// não recalcula nada. `Quote.order`/`SalesOrder.quoteId` existiam desde o
// primeiro schema e nunca tinham sido usados.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;

  const parsed = convertSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (quote.status === "CONVERTED") return NextResponse.json({ error: "Este orçamento já foi convertido em venda" }, { status: 409 });

  // SalesOrder.quoteId é @unique — se já existe um pedido pra este orçamento
  // (ex: o status ficou "DRAFT" de novo por uma edição antiga, antes do fix),
  // não tenta criar outro: reconcilia o status e avisa com o pedido certo,
  // em vez de deixar a constraint do banco estourar como erro genérico 500.
  const existingOrder = await prisma.salesOrder.findUnique({ where: { quoteId: quote.id }, select: { orderNumber: true } });
  if (existingOrder) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED" } });
    return NextResponse.json({ error: `Este orçamento já virou a venda ${existingOrder.orderNumber} — o status dele foi corrigido.` }, { status: 409 });
  }

  let plannedMinutes = 0;
  let printTimeHours = 0;
  let marketplaceName = "Venda Direta";
  let marketplaceId: string | null = null;
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as { calculations?: { printTime?: number }; marketplace?: { id?: string; name?: string } };
    printTimeHours = Number(snapshot.calculations?.printTime) || 0;
    plannedMinutes = Math.round(printTimeHours * 60);
    if (snapshot.marketplace?.id && snapshot.marketplace.id !== "direct") {
      marketplaceId = snapshot.marketplace.id;
      marketplaceName = snapshot.marketplace.name || "Venda Direta";
    }
  } catch {
    // snapshot corrompido — segue com os padrões (sem canal, sem tempo)
  }

  // O canal pode ter sido removido de Configurações desde que o orçamento foi
  // feito — nesse caso cai pra Venda Direta em vez de referenciar um id que
  // não existe mais.
  const channel = marketplaceId ? await prisma.marketplaceChannel.findUnique({ where: { id: marketplaceId } }) : null;

  // O cliente já foi cadastrado em Clientes quando o orçamento foi salvo (ver
  // ensureCustomerRegistered em Orçamentos) — aqui só vincula o pedido a esse
  // cadastro pelo nome; não recria nem deixa trocar.
  const trimmedName = quote.customerName.trim().toLowerCase();
  const matchedCustomer = trimmedName
    ? (await prisma.customer.findMany({ where: { active: true } })).find((c) => c.name.trim().toLowerCase() === trimmedName)
    : undefined;

  // Orçamento com várias peças do Catálogo (kit) vira uma peça de produção
  // por peça — não um item único "1x nome do orçamento".
  const itemDrafts = await buildProductionItemDrafts(prisma, quote.snapshotJson, {
    name: quote.productName,
    quantity: 1,
    productId: quote.productId,
  });

  const [order] = await prisma.$transaction([
    prisma.salesOrder.create({
      data: {
        // A venda herda o número do orçamento (numeração unificada, src/lib/codes.ts).
        orderNumber: await orderNumberForQuote(quote.code),
        quoteId: quote.id,
        customerId: matchedCustomer?.id ?? null,
        productId: quote.productId,
        productName: quote.productName,
        quantity: 1,
        channelId: channel?.id ?? null,
        channel: channel?.name ?? marketplaceName,
        unitPrice: quote.finalPrice,
        // Custo REAL (custo do Catálogo + insumos), não o baseCost — que soma os preços de venda.
        unitCostSnapshot: quoteRealCost(quote.snapshotJson) ?? quote.baseCost,
        printTimeHours,
        totalAmount: quote.finalPrice,
        shippingCost: parsed.data.shippingCost ?? 0,
        paymentMethod: parsed.data.paymentMethod ?? "PIX",
        plannedProductionDate: parsed.data.plannedProductionDate ?? null,
        expectedPaymentDate: parsed.data.expectedPaymentDate ?? null,
        notes: quote.customerName ? `Cliente do orçamento: ${quote.customerName}` : "",
        production: { create: { plannedMinutes, items: { create: itemDrafts } } },
      },
      include: { production: { include: { items: true } }, customer: true, product: true, marketplace: true },
    }),
    prisma.quote.update({ where: { id }, data: { status: "CONVERTED" } }),
  ]);

  return NextResponse.json({ order });
}
