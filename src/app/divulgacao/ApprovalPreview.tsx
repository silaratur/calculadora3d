"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@/components/Icons";

/**
 * Revisão de um post da Divulgação: simula o post no celular
 * (feed com o recorte real do Instagram, ou story com as áreas que a
 * interface cobre) e confere as imagens e a legenda contra as regras da API.
 * Erro bloqueia a aprovação; aviso só alerta. O revisor decide ali mesmo:
 * aprovar, reprovar (com motivo) ou mandar para edição.
 */

type Kind = "CAROUSEL" | "IMAGE" | "STORY";
export type PreviewPost = { id: string; title: string; kind: Kind; caption: string; media: string[]; scheduledAt: string | null };
type Meta = { width: number; height: number; bytes: number; type: string };
type Check = { level: "error" | "warn" | "ok"; text: string };

const FEED_MIN = 4 / 5;
const FEED_MAX = 1.91;
const STORY = 9 / 16;
const MAX_BYTES = 8 * 1024 * 1024;
// Na prévia do feed o Instagram mostra ~125 caracteres e esconde o resto atrás do "mais".
const FEED_PREVIEW_CHARS = 125;

const KNOWN_RATIOS: [number, string][] = [[1, "1:1"], [4 / 5, "4:5"], [3 / 4, "3:4"], [9 / 16, "9:16"], [16 / 9, "16:9"], [1.91, "1,91:1"]];
function ratioLabel(width: number, height: number) {
  const ratio = width / height;
  const known = KNOWN_RATIOS.find(([value]) => Math.abs(value - ratio) / value < 0.01);
  return known ? known[1] : `${ratio.toFixed(2).replace(".", ",")}:1`;
}

const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(bytes / 1024)} KB`);

async function loadMeta(url: string): Promise<Meta> {
  const blob = await (await fetch(url)).blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Imagem ilegível"));
      image.src = objectUrl;
    });
    return { width, height, bytes: blob.size, type: blob.type };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function runChecks(post: PreviewPost, metas: Meta[]): Check[] {
  const checks: Check[] = [];
  const story = post.kind === "STORY";
  if (post.kind === "CAROUSEL" && (metas.length < 2 || metas.length > 10)) checks.push({ level: "error", text: `Carrossel precisa de 2 a 10 imagens (tem ${metas.length}).` });

  metas.forEach((meta, index) => {
    const label = metas.length > 1 ? `Imagem ${index + 1}: ` : "";
    const ratio = meta.width / meta.height;
    if (meta.type && meta.type !== "image/jpeg") checks.push({ level: "error", text: `${label}formato ${meta.type} — o Instagram só aceita JPEG.` });
    if (meta.bytes > MAX_BYTES) checks.push({ level: "error", text: `${label}${formatBytes(meta.bytes)} — acima do limite de 8 MB.` });
    if (story) {
      if (Math.abs(ratio - STORY) / STORY > 0.02) checks.push({ level: "warn", text: `${label}proporção ${ratioLabel(meta.width, meta.height)} — story é 9:16; vai aparecer cortado ou com faixas.` });
    } else if (ratio < FEED_MIN - 0.005 || ratio > FEED_MAX + 0.005) {
      checks.push({ level: "error", text: `${label}proporção ${ratioLabel(meta.width, meta.height)} fora do permitido no feed (de 4:5 até 1,91:1).` });
    }
    if (meta.width < 1080) checks.push({ level: "warn", text: `${label}${meta.width} px de largura — abaixo de 1080 px, pode perder nitidez.` });
  });

  if (post.kind === "CAROUSEL" && metas.length > 1) {
    const first = metas[0].width / metas[0].height;
    const different = metas.map((meta, index) => ({ ratio: meta.width / meta.height, index })).filter((item) => Math.abs(item.ratio - first) / first > 0.01);
    if (different.length) checks.push({ level: "warn", text: `Imagens ${different.map((item) => item.index + 1).join(", ")} têm proporção diferente da primeira — o Instagram corta todas no formato da primeira.` });
  }

  if (!story) {
    const hashtags = post.caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    const mentions = post.caption.match(/@[\w.]+/g)?.length ?? 0;
    if (post.caption.length > 2200) checks.push({ level: "error", text: `Legenda com ${post.caption.length} caracteres — o limite é 2.200.` });
    if (hashtags > 30) checks.push({ level: "error", text: `${hashtags} hashtags — o Instagram recusa mais de 30.` });
    if (mentions > 20) checks.push({ level: "error", text: `${mentions} menções — o limite é 20.` });
    if (!post.caption.trim()) checks.push({ level: "warn", text: "Post sem legenda." });
  }

  if (!post.scheduledAt) checks.push({ level: "error", text: "Sem data e hora — use Editar para definir." });
  else if (new Date(post.scheduledAt).getTime() < Date.now()) checks.push({ level: "warn", text: "O horário marcado já passou: aprovado agora, sai em até 1 minuto." });

  if (!checks.some((check) => check.level !== "ok")) checks.push({ level: "ok", text: "Tudo dentro das regras do Instagram." });
  return checks;
}

/** Destaca hashtags e menções como o Instagram faz. */
function CaptionText({ text }: { text: string }) {
  return <>{text.split(/([#@][\p{L}\p{N}_.]+)/gu).map((part, index) => (/^[#@]/.test(part) ? <span key={index} className="ig-tag">{part}</span> : part))}</>;
}

type Props = {
  post: PreviewPost;
  mediaUrl: (postId: string, name: string) => string;
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
  onReject: (note: string) => void;
  onEdit: () => void;
};

export function ApprovalPreview({ post, mediaUrl, busy, onCancel, onApprove, onReject, onEdit }: Props) {
  const [metas, setMetas] = useState<Meta[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const urls = post.media.map((name) => mediaUrl(post.id, name));
  const story = post.kind === "STORY";

  useEffect(() => {
    let cancelled = false;
    Promise.all(post.media.map((name) => loadMeta(mediaUrl(post.id, name))))
      .then((loaded) => { if (!cancelled) setMetas(loaded); })
      .catch(() => { if (!cancelled) setLoadError("Não foi possível ler as imagens para conferir."); });
    return () => { cancelled = true; };
  }, [post, mediaUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "ArrowRight") setIndex((current) => Math.min(current + 1, post.media.length - 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, post.media.length]);

  const checks = metas ? runChecks(post, metas) : [];
  const blocked = !metas || checks.some((check) => check.level === "error");
  // No feed, todo o carrossel usa o recorte da primeira imagem (limitado entre 4:5 e 1,91:1).
  const feedRatio = metas?.[0] ? Math.min(Math.max(metas[0].width / metas[0].height, FEED_MIN), FEED_MAX) : FEED_MIN;
  const caption = post.caption.trim();
  const needsMore = caption.length > FEED_PREVIEW_CHARS || caption.split("\n").length > 2;
  const shortCaption = needsMore ? caption.slice(0, FEED_PREVIEW_CHARS).split("\n").slice(0, 2).join("\n").trimEnd() : caption;
  const when = post.scheduledAt ? new Date(post.scheduledAt).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "sem data";
  const hashtags = post.caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const mentions = post.caption.match(/@[\w.]+/g)?.length ?? 0;

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Revisar ${post.title}`} onClick={onCancel}>
      <div className="modal-card approval-card" onClick={(event) => event.stopPropagation()}>
        <div className="approval-head">
          <div>
            <h2>Revisar post</h2>
            <p>{post.title} · {story ? "Story" : post.kind === "CAROUSEL" ? `Carrossel com ${post.media.length} imagens` : "Post único"}</p>
          </div>
          <button type="button" className="theme-toggle" onClick={onCancel} aria-label="Fechar"><IconX className="nav-icon" /></button>
        </div>

        <div className="approval-body">
          <div className={`ig-phone${story ? " story" : ""}`}>
            {story ? (
              <div className="ig-story">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[0]} alt="Story" />
                <div className="ig-story-top">
                  <div className="ig-progress"><span /></div>
                  <div className="ig-user light">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-ac3d-monograma.png" alt="" /><strong>ac3d_studio</strong><small>agora</small>
                  </div>
                </div>
                <div className="ig-story-bottom"><span>Enviar mensagem</span></div>
                {showSafeZones ? (
                  <>
                    <div className="ig-safe top">Coberto pelo nome e pela barra</div>
                    <div className="ig-safe bottom">Coberto pela caixa de resposta</div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="ig-feed">
                <div className="ig-user">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-ac3d-monograma.png" alt="" /><strong>ac3d_studio</strong>
                </div>
                <div className="ig-media" style={{ aspectRatio: String(feedRatio) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[index]} alt={`Imagem ${index + 1}`} />
                  {urls.length > 1 ? (
                    <>
                      <span className="ig-counter">{index + 1}/{urls.length}</span>
                      {index > 0 ? <button type="button" className="ig-nav prev" onClick={() => setIndex(index - 1)} aria-label="Imagem anterior">‹</button> : null}
                      {index < urls.length - 1 ? <button type="button" className="ig-nav next" onClick={() => setIndex(index + 1)} aria-label="Próxima imagem">›</button> : null}
                    </>
                  ) : null}
                </div>
                <div className="ig-actions">
                  <span aria-hidden="true">♡ ◯ ➤</span>
                  {urls.length > 1 ? <span className="ig-dots">{urls.map((url, dot) => <i key={url} className={dot === index ? "on" : undefined} />)}</span> : null}
                  <span aria-hidden="true">⌑</span>
                </div>
                {caption ? (
                  <p className="ig-caption">
                    <strong>ac3d_studio </strong>
                    <CaptionText text={expanded || !needsMore ? caption : shortCaption} />
                    {needsMore && !expanded ? <>… <button type="button" onClick={() => setExpanded(true)}>mais</button></> : null}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="approval-info">
            <dl className="approval-facts">
              <div><dt>Quando</dt><dd>{when}</dd></div>
              <div><dt>Som</dt><dd>Sem som — imagem estática. Música não pode ser incluída pela API.</dd></div>
              {story ? (
                <div><dt>Interação</dt><dd>Sem link, enquete ou figurinhas (limite da API). O texto precisa estar na arte.</dd></div>
              ) : (
                <div><dt>Legenda</dt><dd>{post.caption.length}/2.200 caracteres · {hashtags}/30 hashtags · {mentions}/20 menções. No feed aparecem só as ~125 primeiras letras antes do &quot;mais&quot;.</dd></div>
              )}
            </dl>
            {story ? <label className="checkbox-field"><input type="checkbox" checked={showSafeZones} onChange={(event) => setShowSafeZones(event.target.checked)} /> Mostrar áreas cobertas pela interface</label> : null}

            <table className="approval-table">
              <thead><tr><th>#</th><th>Dimensões</th><th>Proporção</th><th>Peso</th></tr></thead>
              <tbody>
                {post.media.map((name, row) => {
                  const meta = metas?.[row];
                  return (
                    <tr key={name} className={!story && row === index ? "current" : undefined} onClick={() => setIndex(row)}>
                      <td>{row + 1}</td>
                      <td>{meta ? `${meta.width} × ${meta.height}` : "…"}</td>
                      <td>{meta ? ratioLabel(meta.width, meta.height) : "…"}</td>
                      <td>{meta ? formatBytes(meta.bytes) : "…"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="field-hint">Ideal: {story ? "1080 × 1920 (9:16)" : "1080 × 1350 (4:5), JPEG, até 8 MB"}.</p>

            <ul className="approval-checks">
              {loadError ? <li className="error">{loadError}</li> : null}
              {!metas && !loadError ? <li>Conferindo imagens…</li> : null}
              {checks.map((check) => <li key={check.text} className={check.level}>{check.text}</li>)}
            </ul>
          </div>
        </div>

        {rejecting ? (
          <div className="approval-reject">
            <label>Motivo da reprovação (opcional — aparece no post para quem for corrigir)
              <textarea autoFocus maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex: trocar a foto 3, preço desatualizado, legenda longa demais" />
            </label>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setRejecting(false)}>Cancelar</button>
              <button type="button" className="primary-button modal-danger" disabled={busy} onClick={() => onReject(note)}>{busy ? "Reprovando..." : "Confirmar reprovação"}</button>
            </div>
          </div>
        ) : (
          <div className="form-actions approval-actions">
            <button type="button" className="secondary-button" onClick={onEdit}>Editar</button>
            <button type="button" className="secondary-button approval-reject-button" onClick={() => setRejecting(true)}>Reprovar</button>
            <button type="button" className="primary-button" disabled={blocked || busy} onClick={onApprove} title={blocked && metas ? "Corrija os itens em vermelho para aprovar" : undefined}>{busy ? "Aprovando..." : "Aprovar e agendar"}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
