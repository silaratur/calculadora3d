import { readMedia } from "@/lib/instagram-media";

/**
 * Imagem de um post da Divulgação, pública porque a Meta precisa baixá-la
 * para publicar. O endereço leva o id do post (cuid) e um nome aleatório,
 * então não dá para listar nem adivinhar as artes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const bytes = await readMedia(id, file).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
}
