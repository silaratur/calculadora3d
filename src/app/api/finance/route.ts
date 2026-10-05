import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { loadFinance } from "@/lib/finance-data";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";

/** Quem abre o Caixa (Administrador e Financeiro) usa o Fechamento. */
async function allowed() {
  const user = await getCurrentUser();
  return user && canAccessPath(user.role, "/cashflow") ? user : null;
}

/** GET ?month=AAAA-MM — meses, o mês escolhido em detalhe, contas dos sócios e o fechamento (se houver). */
export async function GET(request: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  const data = await loadFinance(month);
  const closing = data.closings.get(data.selected.month);
  return NextResponse.json({
    current: data.current,
    partners: data.partners,
    cashReserve: data.cashReserve,
    months: data.months.map(({ entries, partners, ...row }) => ({ ...row, withdrawalsByPartner: partners, closed: data.closings.has(row.month), entriesCount: entries.length })),
    selected: data.selected,
    accounts: data.accounts,
    closing: closing ? { closedAt: closing.closedAt, closedBy: closing.closedBy, notes: closing.notes, snapshot: JSON.parse(closing.snapshot) } : null,
  });
}

const settingsSchema = z.object({
  partners: z.array(z.object({ name: z.string().trim().min(1).max(40), share: z.number().min(0).max(100) })).min(1).max(6),
  cashReserve: z.number().min(0).max(1_000_000),
});

/** PUT — sócios (nome e participação) e reserva mínima do caixa. */
export async function PUT(request: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Confira os nomes e as participações." }, { status: 400 });
  const total = parsed.data.partners.reduce((sum, partner) => sum + partner.share, 0);
  if (Math.abs(total - 100) > 0.01) return NextResponse.json({ error: `As participações somam ${total}%; precisam somar 100%.` }, { status: 400 });
  // Renomear sócio: os lançamentos antigos acompanham o nome novo (mesma posição na lista).
  const before = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const old = (JSON.parse(before.partnersJson || "[]") as { name: string }[]).map((partner) => partner.name);
  await prisma.$transaction([
    ...parsed.data.partners.flatMap((partner, index) => (old[index] && old[index] !== partner.name ? [prisma.cashEntry.updateMany({ where: { partner: old[index] }, data: { partner: partner.name } })] : [])),
    prisma.pricingSettings.update({ where: { id: "default" }, data: { partnersJson: JSON.stringify(parsed.data.partners), cashReserve: parsed.data.cashReserve } }),
  ]);
  return NextResponse.json({ success: true });
}
