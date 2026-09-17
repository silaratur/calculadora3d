import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quoteSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(2),
  customerName: z.string().optional(),
  status: z.string().default("DRAFT"),
  baseCost: z.number().min(0),
  finalPrice: z.number().min(0),
  margin: z.number(),
  snapshot: z.record(z.string(), z.unknown()),
  notes: z.string().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.quote.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const quote = await prisma.quote.create({ data: { productId: parsed.data.productId ?? null, productName: parsed.data.productName, customerName: parsed.data.customerName ?? "", status: parsed.data.status, baseCost: parsed.data.baseCost, finalPrice: parsed.data.finalPrice, margin: parsed.data.margin, snapshotJson: JSON.stringify(parsed.data.snapshot), notes: parsed.data.notes ?? "" } });
  return NextResponse.json(quote, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.quote.update({ where: { id }, data: { status: "ARCHIVED" } });
  return NextResponse.json({ success: true });
}
