import { z } from "zod";
import type { InstagramPost } from "@prisma/client";
import { parseMedia } from "@/lib/instagram-media";

export const KINDS = ["CAROUSEL", "IMAGE", "STORY", "REEL"] as const;

/** images: na ordem final — nome de arquivo já salvo ou data URI novo (JPEG, ou MP4 no reel). */
export const postSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS),
  caption: z.string().max(2200).default(""),
  scheduledAt: z.string().datetime().nullable().optional(),
  images: z.array(z.string().min(1)).min(1).max(10),
});

/** items: nomes já salvos ou data URIs novos, na ordem. */
export function mediaProblem(kind: string, items: string[]) {
  const videos = items.filter((item) => item.startsWith("data:video/") || item.endsWith(".mp4")).length;
  if (kind === "REEL") return items.length === 1 && videos === 1 ? null : "Reel usa exatamente 1 vídeo MP4.";
  if (videos) return "Vídeo só pode ser publicado como Reel.";
  if (kind === "CAROUSEL" && (items.length < 2 || items.length > 10)) return "Carrossel precisa de 2 a 10 imagens.";
  if (kind !== "CAROUSEL" && items.length !== 1) return "Post único e story usam exatamente 1 imagem.";
  return null;
}

export function serializePost(post: InstagramPost) {
  return { ...post, media: parseMedia(post.media) };
}
