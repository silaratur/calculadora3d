import { z } from "zod";
import type { InstagramPost } from "@prisma/client";
import { parseMedia } from "@/lib/instagram-media";

export const KINDS = ["CAROUSEL", "IMAGE", "STORY"] as const;

/** images: na ordem final — nome de arquivo já salvo ou data URI JPEG novo. */
export const postSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS),
  caption: z.string().max(2200).default(""),
  scheduledAt: z.string().datetime().nullable().optional(),
  images: z.array(z.string().min(1)).min(1).max(10),
});

export function mediaProblem(kind: string, count: number) {
  if (kind === "CAROUSEL" && (count < 2 || count > 10)) return "Carrossel precisa de 2 a 10 imagens.";
  if (kind !== "CAROUSEL" && count !== 1) return "Post único e story usam exatamente 1 imagem.";
  return null;
}

export function serializePost(post: InstagramPost) {
  return { ...post, media: parseMedia(post.media) };
}
