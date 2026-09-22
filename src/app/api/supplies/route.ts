import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const supplySchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  unitCost: z.number().min(0),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseLink: z.string().url().or(z.literal("")).optional(),
  active: z.boolean().optional(),
});

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  // Seletores (Orçamentos/Catálogo) só querem os disponíveis; a Biblioteca
  // (?all=true) precisa ver os desativados também, pra poder reativar.
  const includeInactive = new URL(request.url).searchParams.get("all") === "true";
  return NextResponse.json(await prisma.supply.findMany({ where: includeInactive ? {} : { active: true }, orderBy: { name: "asc" } }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = supplySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const supply = await prisma.supply.create({ data: { ...parsed.data, purchaseDate: parsed.data.purchaseDate ?? null, purchaseLink: parsed.data.purchaseLink ?? "", active: parsed.data.active ?? true } });
  return NextResponse.json(supply, { status: 201 });
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = supplySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const supply = await prisma.supply.update({ where: { id }, data: { ...parsed.data, purchaseDate: parsed.data.purchaseDate ?? null, purchaseLink: parsed.data.purchaseLink ?? "" } });
  return NextResponse.json(supply);
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.supply.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}

/** Reativar sem reabrir o formulário inteiro — só troca o active. */
export async function PATCH(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = z.object({ active: z.boolean() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const supply = await prisma.supply.update({ where: { id }, data: { active: parsed.data.active } });
  return NextResponse.json(supply);
}