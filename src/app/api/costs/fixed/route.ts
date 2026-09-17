import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const rubrics = ["rent", "software", "accounting", "internet", "maintenance", "marketing", "energy", "subscriptions", "other"] as const;

const fixedCostSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM"),
  rent: z.number().min(0).optional(),
  software: z.number().min(0).optional(),
  accounting: z.number().min(0).optional(),
  internet: z.number().min(0).optional(),
  maintenance: z.number().min(0).optional(),
  marketing: z.number().min(0).optional(),
  energy: z.number().min(0).optional(),
  subscriptions: z.number().min(0).optional(),
  other: z.number().min(0).optional(),
});

function total(entry: Record<(typeof rubrics)[number], number>) {
  return rubrics.reduce((sum, key) => sum + entry[key], 0);
}

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const months = await prisma.fixedCostMonth.findMany({ orderBy: { month: "desc" } });
  return NextResponse.json(months.map((entry) => ({ ...entry, total: total(entry) })));
}

// Um lançamento por mês (upsert por `month`). Salvar sempre mantém em
// sincronia uma única saída de caixa para aquele mês (data = dia 1º).
export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = fixedCostSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const values = Object.fromEntries(rubrics.map((key) => [key, data[key] ?? 0])) as Record<(typeof rubrics)[number], number>;

  const entry = await prisma.fixedCostMonth.upsert({
    where: { month: data.month },
    update: values,
    create: { month: data.month, ...values },
  });
  const amount = total(entry);
  const date = new Date(`${data.month}-01T00:00:00`);

  if (amount > 0) {
    await prisma.cashEntry.upsert({
      where: { sourceType_sourceId: { sourceType: "FIXED_COST", sourceId: entry.id } },
      update: { amount, date, description: `Custos fixos de ${data.month}` },
      create: {
        date,
        category: "Custo Fixo",
        type: "OUT",
        description: `Custos fixos de ${data.month}`,
        status: "REALIZED",
        amount,
        sourceType: "FIXED_COST",
        sourceId: entry.id,
      },
    });
  } else {
    await prisma.cashEntry.deleteMany({ where: { sourceType: "FIXED_COST", sourceId: entry.id } });
  }

  return NextResponse.json({ ...entry, total: amount }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.cashEntry.deleteMany({ where: { sourceType: "FIXED_COST", sourceId: id } });
  await prisma.fixedCostMonth.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
