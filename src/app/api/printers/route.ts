import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const printerSchema = z.object({
  model: z.string().min(2),
  purchasePrice: z.number().min(0),
  powerWatts: z.number().min(0),
  usefulLifeHours: z.number().min(1),
  maintenancePerHour: z.number().min(0),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseLink: z.string().url().or(z.literal("")).optional(),
  active: z.boolean().optional(),
});

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.printer.findMany({ where: { active: true }, orderBy: { model: "asc" } }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = printerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const printer = await prisma.printer.create({ data: { ...parsed.data, purchaseDate: parsed.data.purchaseDate ?? null, purchaseLink: parsed.data.purchaseLink ?? "", active: parsed.data.active ?? true } });
  return NextResponse.json(printer, { status: 201 });
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = printerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const printer = await prisma.printer.update({ where: { id }, data: { ...parsed.data, purchaseDate: parsed.data.purchaseDate ?? null, purchaseLink: parsed.data.purchaseLink ?? "" } });
  return NextResponse.json(printer);
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.printer.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}