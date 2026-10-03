import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pruneMedia, saveMedia } from "@/lib/instagram-media";
import { prisma } from "@/lib/prisma";
import { mediaProblem, postSchema, serializePost } from "./shared";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const posts = await prisma.instagramPost.findMany({ orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json(posts.map(serializePost));
}

/** Novo post sempre nasce rascunho — publicar exige aprovar depois. */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira título, tipo, legenda e imagens." }, { status: 400 });
  const { images, scheduledAt, ...data } = parsed.data;
  const problem = mediaProblem(data.kind, images.length);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const post = await prisma.instagramPost.create({ data: { ...data, scheduledAt: scheduledAt ? new Date(scheduledAt) : null } });
  try {
    const media: string[] = [];
    for (const image of images) media.push(await saveMedia(post.id, image));
    return NextResponse.json(serializePost(await prisma.instagramPost.update({ where: { id: post.id }, data: { media: JSON.stringify(media) } })));
  } catch (error) {
    await prisma.instagramPost.delete({ where: { id: post.id } });
    await pruneMedia(post.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar as imagens." }, { status: 400 });
  }
}
