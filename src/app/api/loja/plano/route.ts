import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activateCampaign, campaignState, marginPreview, pauseCampaign, recipe } from "@/lib/campaign-plan";
import { notifyStore } from "@/lib/store-sync";

/**
 * Loja → Plano de campanhas. GET lista as campanhas (com a prévia de margem de
 * cada peça); PATCH { id, action: "ativar" | "pausar" } liga ou desliga tudo o
 * que a campanha controla (promoção, cupom, coleção e banner).
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const campaigns = await prisma.storeCampaign.findMany({ orderBy: [{ startsAt: "asc" }, { sortOrder: "asc" }] });
  const now = new Date();
  return NextResponse.json(await Promise.all(campaigns.map(async (campaign) => ({
    ...campaign,
    state: campaignState(campaign, now),
    recipe: recipe(campaign),
    margins: await marginPreview(campaign),
  }))));
}

const actionSchema = z.object({ id: z.string().min(1), action: z.enum(["ativar", "pausar"]) });

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    if (parsed.data.action === "ativar") await activateCampaign(parsed.data.id);
    else await pauseCampaign(parsed.data.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 409 });
  }
  notifyStore();
  return NextResponse.json({ ok: true });
}
