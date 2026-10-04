import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EVENT_TYPES } from "@/lib/store-analytics";

/**
 * Medição própria da loja: o servidor da loja junta os eventos do navegador e
 * manda aqui (header x-store-key = STORE_API_KEY). Nada pessoal: só um código
 * aleatório da visita, a peça (SKU), de onde veio a ação e o canal.
 */
const eventsSchema = z.object({
  events: z.array(z.object({
    type: z.enum(EVENT_TYPES),
    sessionId: z.string().trim().min(6).max(40),
    sku: z.string().trim().max(20).optional(),
    campaign: z.string().trim().max(60).optional(),
    source: z.string().trim().max(60).optional(),
    value: z.number().min(0).max(100000).optional(),
  })).min(1).max(30),
});

export async function POST(request: Request) {
  const key = process.env.STORE_API_KEY;
  if (!key) return NextResponse.json({ error: "Integração com a loja desativada" }, { status: 503 });
  if (request.headers.get("x-store-key") !== key) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = eventsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Eventos inválidos" }, { status: 400 });

  const skus = [...new Set(parsed.data.events.map((event) => event.sku).filter((sku): sku is string => Boolean(sku)))];
  const products = skus.length ? await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }) : [];
  const bySku = new Map(products.map((product) => [product.sku, product.id]));
  const result = await prisma.storeEvent.createMany({
    data: parsed.data.events.map((event) => ({
      type: event.type,
      sessionId: event.sessionId,
      productId: event.sku ? bySku.get(event.sku) ?? null : null,
      campaign: event.campaign ?? "",
      source: event.source ?? "",
      value: event.value ?? 0,
    })),
  });
  return NextResponse.json({ saved: result.count });
}
