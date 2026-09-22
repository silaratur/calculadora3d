import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const materialSchema = z.object({
  name: z.string().min(2),
  brand: z.string().optional(),
  type: z.string().min(2),
  color: z.string().optional(),
  costPerKg: z.number().min(0),
  unitPrice: z.number().min(0).optional(),
  unitWeightGrams: z.number().min(1).optional(),
  stockGrams: z.number().min(0),
  lowStockThresholdGrams: z.number().min(0).optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseLink: z.string().url().or(z.literal("")).optional(),
  active: z.boolean().optional(),
});

async function isAuthenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Seletores (Orçamentos/Catálogo) só querem os disponíveis; a Biblioteca
  // (?all=true) precisa ver os desativados também, pra poder reativar.
  const includeInactive = new URL(request.url).searchParams.get("all") === "true";
  const materials = await prisma.material.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(materials);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const parsed = materialSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const material = await prisma.material.create({
    data: {
      ...parsed.data,
      brand: parsed.data.brand ?? "",
      color: parsed.data.color ?? "",
      unitPrice: parsed.data.unitPrice ?? 0,
      unitWeightGrams: parsed.data.unitWeightGrams ?? 1000,
      purchaseDate: parsed.data.purchaseDate ?? null,
      purchaseLink: parsed.data.purchaseLink ?? "",
      active: parsed.data.active ?? true,
    },
  });

  return NextResponse.json(material, { status: 201 });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = materialSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const material = await prisma.material.update({
    where: { id },
    data: { ...parsed.data, brand: parsed.data.brand ?? "", color: parsed.data.color ?? "", unitPrice: parsed.data.unitPrice ?? 0, unitWeightGrams: parsed.data.unitWeightGrams ?? 1000, purchaseDate: parsed.data.purchaseDate ?? null, purchaseLink: parsed.data.purchaseLink ?? "" },
  });
  return NextResponse.json(material);
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.material.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}

/** Reativar sem reabrir o formulário inteiro — só troca o active. */
export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = z.object({ active: z.boolean() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const material = await prisma.material.update({ where: { id }, data: { active: parsed.data.active } });
  return NextResponse.json(material);
}