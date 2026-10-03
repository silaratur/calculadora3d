import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getInstagramAccount, graphGet } from "@/lib/instagram";
import { prisma } from "@/lib/prisma";

/**
 * Relatório só de leitura para as tarefas agendadas na nuvem (acompanhamento
 * dos posts e revisão semanal do Instagram). Protegido por REPORT_API_KEY no
 * header x-report-key; sem a variável no .env a rota nem existe. Não publica
 * nem altera nada — devolve a fila, as métricas do Instagram e os pedidos da
 * loja que vieram do Instagram no período (?dias=7, até 31).
 */

type Insight = { name: string; values?: { value: number }[]; total_value?: { value: number } };
type Media = { id: string; caption?: string; media_type: string; media_product_type: string; timestamp: string; permalink: string; like_count?: number; comments_count?: number };

function authorized(request: Request) {
  const expected = process.env.REPORT_API_KEY;
  const given = request.headers.get("x-report-key") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const insightMap = (data: Insight[] = []) => Object.fromEntries(data.map((item) => [item.name, item.values?.[0]?.value ?? item.total_value?.value ?? null]));

export async function GET(request: Request) {
  if (!process.env.REPORT_API_KEY) return new Response("Not found", { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 7, 1), 31);
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400000);

  const queue = await prisma.instagramPost.findMany({
    where: { OR: [{ scheduledAt: { gte: since, lte: new Date(now.getTime() + 8 * 86400000) } }, { publishedAt: { gte: since } }] },
    orderBy: { scheduledAt: "asc" },
    select: { title: true, kind: true, status: true, scheduledAt: true, publishedAt: true, permalink: true, error: true, reviewNote: true },
  });

  const quotes = await prisma.quote.findMany({
    where: { source: { not: "manual" }, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, source: true, sourceDetail: true, status: true, productName: true, finalPrice: true },
  });

  const instagram: Record<string, unknown> = {};
  const account = await getInstagramAccount();
  if (!account) {
    instagram.error = "Instagram não conectado";
  } else {
    const { token, igUserId } = account;
    try {
      instagram.profile = await graphGet("/me", { fields: "username,followers_count,follows_count,media_count", access_token: token });
      const list = await graphGet<{ data: Media[] }>("/me/media", { fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: "50", access_token: token });
      const recent = list.data.filter((item) => new Date(item.timestamp) >= since);
      instagram.media = await Promise.all(recent.map(async (item) => {
        const metrics = item.media_product_type === "REELS" ? "reach,views,saved,shares,total_interactions,ig_reels_avg_watch_time" : "reach,views,saved,shares,total_interactions";
        const insights = await graphGet<{ data: Insight[] }>(`/${item.id}/insights`, { metric: metrics, access_token: token }).then((r) => insightMap(r.data)).catch((error: Error) => ({ error: error.message }));
        return { ...item, caption: (item.caption ?? "").slice(0, 160), insights };
      }));
      const stories = await graphGet<{ data: { id: string; timestamp: string; permalink?: string }[] }>("/me/stories", { fields: "id,timestamp,permalink", access_token: token }).catch(() => ({ data: [] }));
      instagram.activeStories = await Promise.all(stories.data.map(async (story) => ({
        ...story,
        insights: await graphGet<{ data: Insight[] }>(`/${story.id}/insights`, { metric: "reach,views,replies,shares,total_interactions,navigation,profile_visits,follows", access_token: token }).then((r) => insightMap(r.data)).catch((error: Error) => ({ error: error.message })),
      })));
      const totals = await graphGet<{ data: Insight[] }>(`/${igUserId}/insights`, {
        metric: "reach,views,accounts_engaged,total_interactions,website_clicks,profile_views",
        period: "day",
        metric_type: "total_value",
        since: String(Math.floor(since.getTime() / 1000)),
        until: String(Math.floor(now.getTime() / 1000)),
        access_token: token,
      }).catch((error: Error) => ({ data: [], error: error.message }));
      instagram.account = insightMap(totals.data);
    } catch (error) {
      instagram.error = error instanceof Error ? error.message : "Falha ao ler o Instagram";
    }
  }

  return NextResponse.json({ geradoEm: now.toISOString(), periodo: { dias: days, desde: since.toISOString() }, fila: queue, instagram, pedidosDaLoja: quotes });
}
