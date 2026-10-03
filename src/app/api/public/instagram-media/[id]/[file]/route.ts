import { mediaContentType, readMedia } from "@/lib/instagram-media";

/**
 * Imagem ou vídeo de um post da Divulgação, público porque a Meta precisa
 * baixá-lo para publicar. O endereço leva o id do post (cuid) e um nome
 * aleatório, então não dá para listar nem adivinhar as artes. Atende Range
 * para o vídeo tocar e avançar no navegador.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const bytes = await readMedia(id, file).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  const headers = { "Content-Type": mediaContentType(file), "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start >= bytes.length || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
}
