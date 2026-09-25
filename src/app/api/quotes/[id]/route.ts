import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quoteSchema } from "../route";
import { isNewRevision } from "@/lib/quotes";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  // Com as revisões anteriores (histórico da negociação), mais nova primeiro.
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { revisions: { orderBy: { number: "desc" } }, order: { select: { id: true, orderNumber: true } } },
  });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  return NextResponse.json(quote);
}

/**
 * Atualiza um orçamento já existente (ex: reabriu via "Carregar no Editor" e
 * salvou de novo) — sem isso, cada "Salvar" criava uma linha nova em vez de
 * atualizar a mesma, duplicando registros em Projetos. Mantém o code, o
 * validUntil e o status originais: é o mesmo orçamento, não um reemitido —
 * editar o conteúdo não pode reverter um orçamento já "Convertido em venda"
 * de volta pra rascunho (o formulário de Orçamentos sempre manda "DRAFT" aqui,
 * então usar o valor enviado sobrescrevia o status e deixava o pedido já
 * criado órfão, batendo no @unique de SalesOrder.quoteId numa nova conversão).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  // Orçamento aprovado já virou venda: fica travado. Mudança depois disso é na
  // venda — ou duplica como novo orçamento. (Antes dava pra editar e o
  // orçamento/PDF ficavam diferentes da venda.)
  if (existing.status === "CONVERTED") {
    return NextResponse.json({ error: "Este orçamento já foi aprovado e virou venda — não pode mais ser alterado. Duplique como novo orçamento se precisar de outra proposta." }, { status: 409 });
  }
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const snapshotJson = JSON.stringify(parsed.data.snapshot);

  // Preço final ou itens mudaram → a versão que estava salva vira uma revisão
  // no histórico e o orçamento passa pra próxima (uso interno; o PDF não mostra).
  const newRevision = isNewRevision(existing, { finalPrice: parsed.data.finalPrice, snapshotJson });

  const quote = await prisma.$transaction(async (tx) => {
    if (newRevision) {
      await tx.quoteRevision.create({
        data: {
          quoteId: id,
          number: existing.revision,
          productName: existing.productName,
          baseCost: existing.baseCost,
          finalPrice: existing.finalPrice,
          margin: existing.margin,
          snapshotJson: existing.snapshotJson,
          notes: existing.notes,
          // a revisão "valeu" até agora; a data dela é a do último salvamento
          createdAt: existing.updatedAt,
        },
      });
    }
    return tx.quote.update({
      where: { id },
      data: {
        revision: newRevision ? existing.revision + 1 : existing.revision,
        productId: parsed.data.productId ?? null,
        productName: parsed.data.productName,
        customerName: parsed.data.customerName ?? "",
        customerPhone: parsed.data.customerPhone ?? "",
        customerEmail: parsed.data.customerEmail ?? "",
        baseCost: parsed.data.baseCost,
        finalPrice: parsed.data.finalPrice,
        margin: parsed.data.margin,
        snapshotJson,
        notes: parsed.data.notes ?? "",
      },
    });
  });
  return NextResponse.json(quote);
}

/**
 * Reabre um orçamento reprovado (o cliente voltou): volta pra "Em aberto" e
 * limpa o motivo. Aprovado não reabre — já é venda.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "reopen") return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (existing.status !== "ARCHIVED") return NextResponse.json({ error: "Só orçamentos reprovados podem ser reabertos" }, { status: 400 });
  const quote = await prisma.quote.update({ where: { id }, data: { status: "DRAFT", archiveReason: "" } });
  return NextResponse.json(quote);
}

/**
 * Exclusão definitiva — só de orçamentos já arquivados (Não Executados) e só
 * por administrador. Orçamentos válidos usam o "arquivar" (DELETE em
 * /api/quotes, que só muda o status); apagar de verdade é irreversível.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Só administradores podem excluir orçamentos definitivamente" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (existing.status !== "ARCHIVED") {
    return NextResponse.json({ error: "Só é possível excluir definitivamente orçamentos já arquivados em Não Executados" }, { status: 400 });
  }
  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
