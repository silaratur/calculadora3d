import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publishInstagramPost } from "@/lib/instagram-publisher";
import { serializePost } from "../../shared";

// Carrossel de 10 imagens pode levar mais de um minuto na Meta.
export const maxDuration = 300;

/** "Publicar agora" de um post aprovado (sem esperar a hora marcada). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json(serializePost(await publishInstagramPost(id)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao publicar." }, { status: 400 });
  }
}
