import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseMedia, pruneMedia, saveMedia } from "@/lib/instagram-media";
import { prisma } from "@/lib/prisma";
import { mediaProblem, postSchema, serializePost } from "../shared";

type Params = { params: Promise<{ id: string }> };
const EDITABLE = ["DRAFT", "APPROVED", "FAILED", "REJECTED"];

/** Editar devolve o post para rascunho: o que muda precisa ser aprovado de novo. */
export async function PUT(request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const current = await prisma.instagramPost.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
  if (!EDITABLE.includes(current.status)) return NextResponse.json({ error: "Post publicado ou em publicação não pode ser editado." }, { status: 409 });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira título, tipo, legenda e imagens." }, { status: 400 });
  const { images, scheduledAt, ...data } = parsed.data;
  const problem = mediaProblem(data.kind, images.length);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const existing = parseMedia(current.media);
  try {
    const media: string[] = [];
    for (const image of images) {
      if (existing.includes(image)) media.push(image);
      else if (image.startsWith("data:")) media.push(await saveMedia(id, image));
      else return NextResponse.json({ error: "Imagem desconhecida." }, { status: 400 });
    }
    const post = await prisma.instagramPost.update({
      where: { id },
      data: { ...data, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, media: JSON.stringify(media), status: "DRAFT", error: "" },
    });
    await pruneMedia(id, media);
    return NextResponse.json(serializePost(post));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar as imagens." }, { status: 400 });
  }
}

const statusSchema = z.object({ status: z.enum(["APPROVED", "DRAFT", "REJECTED"]), note: z.string().trim().max(500).optional() });

/**
 * Revisão: aprovar (agenda), reprovar (com motivo) ou voltar para rascunho.
 * Falha também pode ser reaprovada para tentar de novo.
 */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  const current = await prisma.instagramPost.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
  if (!EDITABLE.includes(current.status)) return NextResponse.json({ error: "Post publicado ou em publicação não muda de status." }, { status: 409 });
  if (parsed.data.status === "APPROVED") {
    if (!current.scheduledAt) return NextResponse.json({ error: "Defina data e hora antes de aprovar." }, { status: 400 });
    const problem = mediaProblem(current.kind, parseMedia(current.media).length);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const reviewNote = parsed.data.status === "REJECTED" ? parsed.data.note ?? "" : parsed.data.status === "APPROVED" ? "" : current.reviewNote;
  const post = await prisma.instagramPost.update({ where: { id }, data: { status: parsed.data.status, error: "", reviewNote } });
  return NextResponse.json(serializePost(post));
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const current = await prisma.instagramPost.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ ok: true });
  if (current.status === "PUBLISHING") return NextResponse.json({ error: "Aguarde terminar a publicação." }, { status: 409 });
  await prisma.instagramPost.delete({ where: { id } });
  await pruneMedia(id);
  return NextResponse.json({ ok: true });
}
