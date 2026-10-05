import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { monthOf } from "@/lib/finance";
import { loadFinance } from "@/lib/finance-data";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";

/** Fechar o mês: congela os números (foto) e bloqueia lançamentos com data nele. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessPath(user.role, "/cashflow")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), notes: z.string().trim().max(500).default("") }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  if (parsed.data.month >= monthOf(new Date())) return NextResponse.json({ error: "Só dá para fechar um mês que já terminou." }, { status: 400 });
  const data = await loadFinance(parsed.data.month);
  if (data.selected.month !== parsed.data.month) return NextResponse.json({ error: "Mês sem movimento." }, { status: 400 });
  const snapshot = JSON.stringify({ summary: data.selected, accounts: data.accounts });
  const closing = await prisma.monthClosing.upsert({
    where: { month: parsed.data.month },
    update: { snapshot, notes: parsed.data.notes, closedBy: user.email, closedAt: new Date() },
    create: { month: parsed.data.month, snapshot, notes: parsed.data.notes, closedBy: user.email },
  });
  return NextResponse.json({ month: closing.month, closedAt: closing.closedAt });
}

/** Reabrir o mês (DELETE ?month=) — volta a aceitar lançamentos; a foto antiga é descartada. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessPath(user.role, "/cashflow")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const month = new URL(request.url).searchParams.get("month");
  if (!month) return NextResponse.json({ error: "Mês obrigatório" }, { status: 400 });
  await prisma.monthClosing.deleteMany({ where: { month } });
  return NextResponse.json({ success: true });
}
