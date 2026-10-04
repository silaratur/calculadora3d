import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSizes } from "@/lib/promotions";
import { notifyStore } from "@/lib/store-sync";

/**
 * Loja → Promoções → preços promocionais. GET lista os produtos ativos com
 * preço, custo, tamanhos e a promoção de cada um; PUT aplica a mesma promoção
 * (% + nome + período) a vários produtos; DELETE ?productId encerra.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, category: true, price: true, cost: true, showInStore: true, brandReview: true, sizeOptions: true, promoPercent: true, promoLabel: true, promoStartsAt: true, promoEndsAt: true },
  });
  return NextResponse.json(products.map(({ sizeOptions, ...product }) => ({ ...product, sizes: parseSizes(sizeOptions) })));
}

const applySchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(500),
  percent: z.number().min(1).max(90),
  label: z.string().trim().max(40).default(""),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = applySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productIds, percent, label, startsAt, endsAt } = parsed.data;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) return NextResponse.json({ error: "O fim precisa ser depois do início." }, { status: 400 });
  const result = await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: { promoPercent: percent, promoLabel: label, promoStartsAt: startsAt ?? null, promoEndsAt: endsAt ?? null },
  });
  notifyStore();
  return NextResponse.json({ updated: result.count });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "Produto obrigatório" }, { status: 400 });
  await prisma.product.update({ where: { id: productId }, data: { promoPercent: 0, promoLabel: "", promoStartsAt: null, promoEndsAt: null } });
  notifyStore();
  return NextResponse.json({ success: true });
}
