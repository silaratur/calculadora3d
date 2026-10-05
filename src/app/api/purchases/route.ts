import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { closedMonthFor } from "@/lib/finance-data";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";

// "Registrar compra" (Biblioteca): uma compra de filamento ou insumo vira, de
// uma vez, custo variável (rubrica Filamento ou Insumos) + saída no Caixa,
// atualiza o custo do item na Biblioteca (o que a calculadora usa) e, no
// filamento, soma o peso ao estoque.

async function allowed() {
  const user = await getCurrentUser();
  return user && (canAccessPath(user.role, "/admin") || canAccessPath(user.role, "/costs")) ? user : null;
}

const cents = (value: number) => Math.round(value * 100) / 100;
/** Dia escolhido ao meio-dia de Brasília (nunca cai no dia/mês anterior). */
const noonBrt = (day: string) => new Date(`${day}T12:00:00-03:00`);

const purchaseSchema = z.object({
  kind: z.enum(["material", "supply"]),
  itemId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Filamento: gramas compradas. Insumo: unidades. */
  quantity: z.number().positive(),
  totalPaid: z.number().positive(),
  supplier: z.string().trim().max(120).optional(),
  purchaseLink: z.string().url().or(z.literal("")).optional(),
  updatePrice: z.boolean().default(true),
});

/** GET ?kind=material|supply&itemId= — últimas compras do item (ou as 50 mais recentes de tudo). */
export async function GET(request: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const itemId = params.get("itemId") ?? undefined;
  const [materials, supplies] = await Promise.all([
    kind === "supply" ? [] : prisma.materialPurchase.findMany({ where: { materialId: itemId }, include: { material: { select: { name: true } } }, orderBy: { purchaseDate: "desc" }, take: 50 }),
    kind === "material" ? [] : prisma.supplyPurchase.findMany({ where: { supplyId: itemId }, include: { supply: { select: { name: true } } }, orderBy: { purchaseDate: "desc" }, take: 50 }),
  ]);
  const rows = [
    ...materials.map((item) => ({ id: item.id, kind: "material", name: item.material.name, date: item.purchaseDate, quantity: item.weightGrams, unit: "g", totalPaid: item.totalPaid || cents((item.unitPrice * item.weightGrams) / 1000), supplier: item.supplier, inCash: Boolean(item.variableCostId) })),
    ...supplies.map((item) => ({ id: item.id, kind: "supply", name: item.supply.name, date: item.purchaseDate, quantity: item.quantity, unit: "un", totalPaid: item.totalPaid, supplier: item.supplier, inCash: Boolean(item.variableCostId) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = purchaseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Confira quantidade, valor e data." }, { status: 400 });
  const data = parsed.data;
  const date = noonBrt(data.date);
  const closed = await closedMonthFor(date);
  if (closed) return NextResponse.json({ error: `O mês ${closed.month} está fechado. Reabra em Dinheiro → Fechamento para lançar compras nele.` }, { status: 409 });
  const totalPaid = cents(data.totalPaid);

  if (data.kind === "material") {
    const material = await prisma.material.findUnique({ where: { id: data.itemId } });
    if (!material) return NextResponse.json({ error: "Filamento não encontrado." }, { status: 404 });
    const perKg = (totalPaid / data.quantity) * 1000;
    const description = `Compra de filamento: ${material.name} (${data.quantity.toLocaleString("pt-BR")} g)${data.supplier ? ` – ${data.supplier}` : ""}`;
    const result = await prisma.$transaction(async (tx) => {
      const cost = await tx.variableCostEntry.create({ data: { date, description, filament: totalPaid } });
      await tx.cashEntry.create({ data: { date, category: "Custo Variável", type: "OUT", description, status: "REALIZED", amount: totalPaid, sourceType: "VARIABLE_COST", sourceId: cost.id } });
      const purchase = await tx.materialPurchase.create({
        data: { materialId: material.id, purchaseDate: date, unitPrice: perKg, weightGrams: data.quantity, totalPaid, supplier: data.supplier ?? "", purchaseLink: data.purchaseLink ?? "", variableCostId: cost.id },
      });
      const updated = await tx.material.update({
        where: { id: material.id },
        data: {
          stockGrams: { increment: data.quantity },
          purchaseDate: date,
          active: true,
          ...(data.purchaseLink ? { purchaseLink: data.purchaseLink } : {}),
          // Preço do rolo no peso cadastrado do rolo (é o que a calculadora lê) + custo por kg.
          ...(data.updatePrice ? { costPerKg: perKg, unitPrice: cents((perKg / 1000) * material.unitWeightGrams) } : {}),
        },
      });
      return { purchase, updated };
    });
    return NextResponse.json({
      id: result.purchase.id,
      before: { perGram: (material.unitPrice || material.costPerKg) / Math.max(material.unitWeightGrams, 1) },
      after: { perGram: (result.updated.unitPrice || result.updated.costPerKg) / Math.max(result.updated.unitWeightGrams, 1) },
      stockGrams: result.updated.stockGrams,
    }, { status: 201 });
  }

  const supply = await prisma.supply.findUnique({ where: { id: data.itemId } });
  if (!supply) return NextResponse.json({ error: "Insumo não encontrado." }, { status: 404 });
  const perUnit = totalPaid / data.quantity;
  const description = `Compra de insumo: ${supply.name} (${data.quantity.toLocaleString("pt-BR")} un)${data.supplier ? ` – ${data.supplier}` : ""}`;
  const result = await prisma.$transaction(async (tx) => {
    const cost = await tx.variableCostEntry.create({ data: { date, description, supplies: totalPaid } });
    await tx.cashEntry.create({ data: { date, category: "Custo Variável", type: "OUT", description, status: "REALIZED", amount: totalPaid, sourceType: "VARIABLE_COST", sourceId: cost.id } });
    const purchase = await tx.supplyPurchase.create({
      data: { supplyId: supply.id, purchaseDate: date, quantity: data.quantity, totalPaid, supplier: data.supplier ?? "", purchaseLink: data.purchaseLink ?? "", variableCostId: cost.id },
    });
    const updated = await tx.supply.update({
      where: { id: supply.id },
      data: { purchaseDate: date, active: true, ...(data.purchaseLink ? { purchaseLink: data.purchaseLink } : {}), ...(data.updatePrice ? { unitCost: Math.round(perUnit * 10000) / 10000 } : {}) },
    });
    return { purchase, updated };
  });
  return NextResponse.json({ id: result.purchase.id, before: { perUnit: supply.unitCost }, after: { perUnit: result.updated.unitCost } }, { status: 201 });
}

/**
 * DELETE ?kind=&id= — desfaz uma compra lançada errada: apaga o custo variável
 * e a saída do Caixa e devolve o estoque do filamento. O custo do item na
 * Biblioteca não volta sozinho (pode ter havido outra compra depois).
 */
export async function DELETE(request: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  if (!id || (kind !== "material" && kind !== "supply")) return NextResponse.json({ error: "Compra inválida" }, { status: 400 });
  const purchase = kind === "material" ? await prisma.materialPurchase.findUnique({ where: { id } }) : await prisma.supplyPurchase.findUnique({ where: { id } });
  if (!purchase) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  const closed = await closedMonthFor(purchase.purchaseDate);
  if (closed) return NextResponse.json({ error: `O mês ${closed.month} está fechado. Reabra em Dinheiro → Fechamento para desfazer esta compra.` }, { status: 409 });
  await prisma.$transaction(async (tx) => {
    if (purchase.variableCostId) {
      await tx.cashEntry.deleteMany({ where: { sourceType: "VARIABLE_COST", sourceId: purchase.variableCostId } });
      await tx.variableCostEntry.deleteMany({ where: { id: purchase.variableCostId } });
    }
    if (kind === "material" && "materialId" in purchase) {
      await tx.material.update({ where: { id: purchase.materialId }, data: { stockGrams: { decrement: purchase.weightGrams } } });
      await tx.materialPurchase.delete({ where: { id } });
    } else {
      await tx.supplyPurchase.delete({ where: { id } });
    }
  });
  return NextResponse.json({ success: true });
}
