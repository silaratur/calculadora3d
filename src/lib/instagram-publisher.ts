import { prisma } from "@/lib/prisma";
import { getInstagramAccount, graphGet, graphPost, publicAppUrl, refreshInstagramTokenIfNeeded } from "@/lib/instagram";
import { parseMedia } from "@/lib/instagram-media";

/**
 * Publica um post APROVADO da Divulgação no @ac3d_studio. Fluxo da API do
 * Instagram: cria um "contêiner" por imagem (a Meta baixa a imagem pela URL
 * pública), espera ficar pronto, junta no carrossel quando for o caso e
 * publica. Nunca publica rascunho: a troca APPROVED → PUBLISHING é atômica,
 * então o agendador e o botão "Publicar agora" não publicam o mesmo post duas vezes.
 */

type Container = { id: string };

async function waitReady(containerId: string, token: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { status_code: status } = await graphGet<{ status_code?: string }>(`/${containerId}`, { fields: "status_code", access_token: token });
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`O Instagram recusou a imagem (${status}). Confira formato e proporção.`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("O Instagram demorou demais para processar as imagens. Tente de novo.");
}

export async function publishInstagramPost(postId: string) {
  const baseUrl = publicAppUrl();
  if (!baseUrl) throw new Error("Publicação desligada neste ambiente (falta PUBLIC_APP_URL). Os posts só saem do servidor de produção.");
  const account = await getInstagramAccount();
  if (!account?.igUserId) throw new Error("Instagram não conectado. Cole o token em Configurações.");

  const claimed = await prisma.instagramPost.updateMany({ where: { id: postId, status: "APPROVED" }, data: { status: "PUBLISHING", error: "" } });
  if (claimed.count !== 1) throw new Error("Só posts aprovados podem ser publicados.");

  try {
    const post = await prisma.instagramPost.findUniqueOrThrow({ where: { id: postId } });
    const media = parseMedia(post.media);
    const { token, igUserId } = account;
    const imageUrl = (name: string) => `${baseUrl}/api/public/instagram-media/${post.id}/${name}`;
    const create = (params: Record<string, string>) => graphPost<Container>(`/${igUserId}/media`, { ...params, access_token: token });

    let creationId: string;
    if (post.kind === "CAROUSEL") {
      if (media.length < 2 || media.length > 10) throw new Error("Carrossel precisa de 2 a 10 imagens.");
      const children: string[] = [];
      for (const name of media) {
        const child = await create({ image_url: imageUrl(name), is_carousel_item: "true" });
        await waitReady(child.id, token);
        children.push(child.id);
      }
      creationId = (await create({ media_type: "CAROUSEL", children: children.join(","), caption: post.caption })).id;
    } else {
      if (media.length !== 1) throw new Error("Este tipo de post usa exatamente 1 imagem.");
      // Story não tem legenda pela API (nem figurinhas de link/enquete).
      const params: Record<string, string> = post.kind === "STORY" ? { image_url: imageUrl(media[0]), media_type: "STORIES" } : { image_url: imageUrl(media[0]), caption: post.caption };
      creationId = (await create(params)).id;
    }
    await waitReady(creationId, token);

    const published = await graphPost<Container>(`/${igUserId}/media_publish`, { creation_id: creationId, access_token: token });
    const details = await graphGet<{ permalink?: string }>(`/${published.id}`, { fields: "permalink", access_token: token }).catch(() => ({ permalink: "" }));
    return await prisma.instagramPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date(), igMediaId: published.id, permalink: details.permalink ?? "", error: "" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao publicar.";
    await prisma.instagramPost.update({ where: { id: postId }, data: { status: "FAILED", error: message.slice(0, 500) } });
    throw new Error(message);
  }
}

let running = false;

/**
 * Uma volta do agendador (src/instrumentation.ts, a cada minuto, só com
 * INSTAGRAM_AUTOPUBLISH=on): renova o token se preciso e publica, em ordem,
 * os aprovados cuja hora já chegou. Erro em um post não trava os outros.
 */
export async function runInstagramScheduler() {
  if (running) return;
  running = true;
  try {
    await refreshInstagramTokenIfNeeded().catch((error) => console.error("[instagram] renovação do token falhou:", error));
    // Post que ficou preso em PUBLISHING (servidor reiniciou no meio) volta como falha para revisão.
    await prisma.instagramPost.updateMany({
      where: { status: "PUBLISHING", updatedAt: { lt: new Date(Date.now() - 15 * 60000) } },
      data: { status: "FAILED", error: "A publicação foi interrompida. Confira no Instagram se o post saiu antes de tentar de novo." },
    });
    const due = await prisma.instagramPost.findMany({ where: { status: "APPROVED", scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: "asc" }, take: 5 });
    for (const post of due) {
      await publishInstagramPost(post.id).catch((error) => console.error(`[instagram] post ${post.id} falhou:`, error));
    }
  } finally {
    running = false;
  }
}
