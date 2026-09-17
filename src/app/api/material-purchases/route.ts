import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const purchaseSchema = z.object({
  materialId: z.string().min(1),
  purchaseDate: z.coerce.date(),
  unitPrice: z.number().min(0),
  weightGrams: z.number().min(1),
  supplier: z.string().optional(),
  purchaseLink: z.string().url().or(z.literal("")).optional(),
  lot: z.string().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.materialPurchase.findMany({ include: { material: true }, orderBy: { purchaseDate: "desc" }, take: 200 }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = purchaseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const purchase = await prisma.materialPurchase.create({ data: { ...parsed.data, supplier: parsed.data.supplier ?? "", purchaseLink: parsed.data.purchaseLink ?? "", lot: parsed.data.lot ?? "" } });
  return NextResponse.json(purchase, { status: 201 });
}
