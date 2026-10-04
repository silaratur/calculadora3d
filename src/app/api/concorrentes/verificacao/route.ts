import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Verificação dos preços dos concorrentes (terças e sextas), feita no PC do
 * dono por scripts/concorrentes-verificar.mjs — Shopee e Mercado Livre só abrem
 * com o login dele (header x-report-key = REPORT_API_KEY):
 *   GET  — anúncios com link para conferir;
 *   POST — { results: [{ id, status, price? }] } grava a rodada, as mudanças e o preço novo.
 * Nunca apaga anúncio: fora do ar vira INDISPONIVEL; só o usuário remove no Catálogo.
 */
function authorized(request: Request) {
  const expected = process.env.REPORT_API_KEY;
  const given = request.headers.get("x-report-key") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!process.env.REPORT_API_KEY) return new Response("Not found", { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const entries = await prisma.competitorPrice.findMany({
    where: { url: { not: "" } },
    orderBy: { productName: "asc" },
    select: { id: true, url: true, price: true, competitor: true, productName: true, product: { select: { sku: true } } },
  });
  return NextResponse.json(entries.map(({ product, ...entry }) => ({ ...entry, sku: product?.sku ?? null })));
}

const resultSchema = z.object({
  results: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(["OK", "INDISPONIVEL", "ERRO"]),
    price: z.number().positive().optional(),
  })).min(1).max(2000),
});

export async function POST(request: Request) {
  if (!process.env.REPORT_API_KEY) return new Response("Not found", { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const parsed = resultSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const entries = await prisma.competitorPrice.findMany({ where: { id: { in: parsed.data.results.map((item) => item.id) } }, select: { id: true, price: true } });
  const current = new Map(entries.map((entry) => [entry.id, entry.price]));
  const now = new Date();
  const run = await prisma.competitorCheckRun.create({ data: {} });
  const counts = { checked: 0, changed: 0, unavailable: 0, errors: 0 };

  for (const result of parsed.data.results) {
    const oldPrice = current.get(result.id);
    if (oldPrice === undefined) continue; // anúncio removido pelo usuário durante a rodada
    if (result.status === "ERRO" || (result.status === "OK" && !result.price)) {
      counts.errors += 1;
      await prisma.competitorPrice.update({ where: { id: result.id }, data: { lastCheckStatus: "ERRO", lastCheckAt: now } });
      continue;
    }
    counts.checked += 1;
    if (result.status === "INDISPONIVEL") {
      counts.unavailable += 1;
      await prisma.$transaction([
        prisma.competitorPriceCheck.create({ data: { runId: run.id, competitorPriceId: result.id, status: "INDISPONIVEL", oldPrice } }),
        prisma.competitorPrice.update({ where: { id: result.id }, data: { lastCheckStatus: "INDISPONIVEL", lastCheckAt: now } }),
      ]);
      continue;
    }
    const newPrice = Math.round(result.price! * 100) / 100;
    if (Math.abs(newPrice - oldPrice) >= 0.01) {
      counts.changed += 1;
      await prisma.$transaction([
        prisma.competitorPriceCheck.create({ data: { runId: run.id, competitorPriceId: result.id, status: "ALTERADO", oldPrice, newPrice } }),
        prisma.competitorPrice.update({ where: { id: result.id }, data: { price: newPrice, checkedAt: now, lastCheckStatus: "ALTERADO", lastCheckAt: now } }),
      ]);
    } else {
      await prisma.competitorPrice.update({ where: { id: result.id }, data: { checkedAt: now, lastCheckStatus: "OK", lastCheckAt: now } });
    }
  }

  await prisma.competitorCheckRun.update({ where: { id: run.id }, data: counts });
  return NextResponse.json({ runId: run.id, ...counts });
}
