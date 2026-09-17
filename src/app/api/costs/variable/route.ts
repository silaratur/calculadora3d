import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const rubrics = ["filament", "commission", "energy", "shipping", "packaging", "waste", "salesFee", "maintenance"] as const;

const variableCostSchema = z.object({
  date: z.coerce.date(),
  description: z.string().optional(),
  filament: z.number().min(0).optional(),
  commission: z.number().min(0).optional(),
  energy: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  packaging: z.number().min(0).optional(),
  waste: z.number().min(0).optional(),
  salesFee: z.number().min(0).optional(),
  maintenance: z.number().min(0).optional(),
});

function total(entry: Record<(typeof rubrics)[number], number>) {
  return rubrics.reduce((sum, key) => sum + entry[key], 0);
}

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const entries = await prisma.variableCostEntry.findMany({ orderBy: { date: "desc" }, take: 200 });
  return NextResponse.json(entries.map((entry) => ({ ...entry, total: total(entry) })));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = variableCostSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const values = Object.fromEntries(rubrics.map((key) => [key, data[key] ?? 0])) as Record<(typeof rubrics)[number], number>;

  const entry = await prisma.variableCostEntry.create({ data: { date: data.date, description: data.description ?? "", ...values } });
  const amount = total(entry);
  if (amount > 0) {
    await prisma.cashEntry.create({
      data: {
        date: data.date,
        category: "Custo Variável",
        type: "OUT",
        description: entry.description || "Lançamento de custo variável",
        status: "REALIZED",
        amount,
        sourceType: "VARIABLE_COST",
        sourceId: entry.id,
      },
    });
  }
  return NextResponse.json({ ...entry, total: amount }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.cashEntry.deleteMany({ where: { sourceType: "VARIABLE_COST", sourceId: id } });
  await prisma.variableCostEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
