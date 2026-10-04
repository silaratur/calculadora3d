import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signedProductImagePath } from "@/lib/signed-media";
import { notifyStore } from "@/lib/store-sync";

/**
 * Revisão de marca dos produtos novos do Catálogo, para a tarefa diária na
 * nuvem (header x-report-key = REPORT_API_KEY):
 *   GET  — produtos com revisão pendente: dados, preço e links assinados das fotos;
 *   POST — { sku, docUrl } marca a proposta como pronta (único campo que altera).
 * Aplicar fotos e texto continua manual, depois da aprovação do dono.
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
  const base = new URL(request.url).origin;
  const products = await prisma.product.findMany({
    where: { active: true, brandReview: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, sku: true, name: true, category: true, description: true, price: true, colors: true, weightGrams: true, sourceUrl: true, imageUrl: true, extraImages: true, createdAt: true },
  });
  return NextResponse.json(products.map(({ imageUrl, extraImages, colors, ...product }) => {
    let extra: string[] = [];
    try { extra = JSON.parse(extraImages || "[]") as string[]; } catch { extra = []; }
    const count = [imageUrl, ...extra].filter(Boolean).length;
    let colorList: string[] = [];
    try { colorList = JSON.parse(colors || "[]") as string[]; } catch { colorList = []; }
    return { ...product, colors: colorList, fotos: Array.from({ length: count }, (_, index) => `${base}${signedProductImagePath(product.id, index)}`) };
  }));
}

const proposedSchema = z.object({ sku: z.string().min(1), docUrl: z.string().url().max(500) });

export async function POST(request: Request) {
  if (!process.env.REPORT_API_KEY) return new Response("Not found", { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const parsed = proposedSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Envie sku e docUrl." }, { status: 400 });
  const result = await prisma.product.updateMany({ where: { sku: parsed.data.sku, brandReview: "PENDING" }, data: { brandReview: "PROPOSED", brandReviewDoc: parsed.data.docUrl } });
  if (result.count) notifyStore();
  return NextResponse.json({ updated: result.count });
}
