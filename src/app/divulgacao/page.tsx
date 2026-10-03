"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { resizeImage } from "@/lib/image";

type Kind = "CAROUSEL" | "IMAGE" | "STORY";
type Status = "DRAFT" | "APPROVED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
type Post = { id: string; title: string; kind: Kind; caption: string; media: string[]; status: Status; scheduledAt: string | null; publishedAt: string | null; permalink: string; error: string };
type Connection = { connected: boolean; username?: string; canPublish: boolean; autopublish: boolean };
// src: nome do arquivo já salvo no servidor ou data URI de uma imagem nova.
type FormImage = { key: string; src: string; preview: string };
type Form = { id: string | null; title: string; kind: Kind; caption: string; scheduledAt: string; images: FormImage[] };

const KIND_LABEL: Record<Kind, string> = { CAROUSEL: "Carrossel", IMAGE: "Post único", STORY: "Story" };
const emptyForm: Form = { id: null, title: "", kind: "CAROUSEL", caption: "", scheduledAt: "", images: [] };

const mediaUrl = (postId: string, name: string) => `/api/public/instagram-media/${postId}/${name}`;

/** Date → valor do <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const formatWhen = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem data");

/**
 * legenda.txt do gerador (scripts/instagram-artes.cjs):
 *   linha 1 "Carrossel · Coleção de Natal" → tipo e título
 *   linha 2 "Quando: terça 29/09, 19h"     → data e hora
 *   resto                                   → legenda
 */
function parseCaptionFile(text: string): Partial<Form> {
  const lines = text.replace(/\r/g, "").split("\n");
  const result: Partial<Form> = {};
  const [type, ...titleParts] = (lines[0] ?? "").split("·");
  if (titleParts.length) {
    result.title = titleParts.join("·").trim();
    result.kind = /carrossel/i.test(type) ? "CAROUSEL" : /story/i.test(type) ? "STORY" : "IMAGE";
  }
  const when = /^quando:/i.test(lines[1] ?? "") ? /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\D+(\d{1,2})h(\d{2})?/.exec(lines[1]) : null;
  if (when) {
    const [, day, month, year, hour, minute] = when;
    const fullYear = year ? (year.length === 2 ? 2000 + Number(year) : Number(year)) : new Date().getFullYear();
    result.scheduledAt = toLocalInput(new Date(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute ?? 0)).toISOString());
  }
  result.caption = lines.slice(result.title !== undefined ? (when ? 2 : 1) : 0).join("\n").trim();
  return result;
}

export default function DivulgacaoPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    async function load() {
      const [postsResponse, connectionResponse] = await Promise.all([fetch("/api/instagram/posts"), fetch("/api/instagram")]);
      if (postsResponse.status === 401) { setNeedsLogin(true); return; }
      if (postsResponse.ok) setPosts((await postsResponse.json()) as Post[]);
      if (connectionResponse.ok) setConnection((await connectionResponse.json()) as Connection);
    }
    void load();
  }, []);

  function upsert(post: Post) {
    setPosts((current) => (current.some((item) => item.id === post.id) ? current.map((item) => (item.id === post.id ? post : item)) : [...current, post]));
  }

  // Aceita as imagens e o legenda.txt da pasta do gerador de uma vez só.
  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    event.target.value = "";
    const captionFile = files.find((file) => file.name.toLowerCase().endsWith(".txt"));
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    try {
      const images = await Promise.all(imageFiles.map(async (file) => {
        const src = await resizeImage(file, 1080, 0.92);
        return { key: `${file.name}-${Math.random().toString(36).slice(2)}`, src, preview: src };
      }));
      const fromCaption = captionFile ? parseCaptionFile(await captionFile.text()) : {};
      setForm((current) => ({ ...current, ...fromCaption, images: [...current.images, ...images].slice(0, 10) }));
      setFeedback(captionFile ? "Legenda, tipo e horário lidos do legenda.txt — confira antes de salvar." : "");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível ler as imagens.");
    }
  }

  function moveImage(index: number, delta: number) {
    setForm((current) => {
      const images = [...current.images];
      const target = index + delta;
      if (target < 0 || target >= images.length) return current;
      [images[index], images[target]] = [images[target], images[index]];
      return { ...current, images };
    });
  }

  function editPost(post: Post) {
    setForm({ id: post.id, title: post.title, kind: post.kind, caption: post.caption, scheduledAt: toLocalInput(post.scheduledAt), images: post.media.map((name) => ({ key: name, src: name, preview: mediaUrl(post.id, name) })) });
    setFeedback(post.status === "APPROVED" ? "Ao salvar, o post volta para rascunho e precisa ser aprovado de novo." : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePost(event: FormEvent) {
    event.preventDefault();
    setBusy("form");
    const response = await fetch(form.id ? `/api/instagram/posts/${form.id}` : "/api/instagram/posts", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, kind: form.kind, caption: form.kind === "STORY" ? "" : form.caption, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null, images: form.images.map((image) => image.src) }),
    });
    const body = (await response.json().catch(() => null)) as (Post & { error?: string }) | null;
    setBusy(null);
    if (!response.ok || !body) { setFeedback(body?.error ?? "Não foi possível salvar o post."); return; }
    upsert(body);
    setForm(emptyForm);
    setFeedback("Rascunho salvo. Confira e aprove para agendar.");
  }

  async function action(post: Post, request: () => Promise<Response>, success: string) {
    setBusy(post.id);
    setFeedback("");
    const response = await request();
    const body = (await response.json().catch(() => null)) as (Post & { error?: string }) | null;
    setBusy(null);
    if (!response.ok) {
      setFeedback(body?.error ?? "Não foi possível concluir.");
      // Falha ao publicar muda o status no servidor: recarrega para mostrar o erro no card.
      const refreshed = await fetch("/api/instagram/posts");
      if (refreshed.ok) setPosts((await refreshed.json()) as Post[]);
      return;
    }
    if (body?.id) upsert(body); else setPosts((current) => current.filter((item) => item.id !== post.id));
    setFeedback(success);
  }

  const setStatus = (post: Post, status: "APPROVED" | "DRAFT", success: string) =>
    action(post, () => fetch(`/api/instagram/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }), success);

  function approve(post: Post) {
    const late = post.scheduledAt && new Date(post.scheduledAt).getTime() < Date.now();
    if (late && !window.confirm("O horário marcado já passou: aprovado agora, o post sai em até 1 minuto. Continuar?")) return;
    void setStatus(post, "APPROVED", "Aprovado e agendado.");
  }

  function publishNow(post: Post) {
    if (!window.confirm(`Publicar "${post.title}" no Instagram agora? Isso não pode ser desfeito por aqui.`)) return;
    void action(post, () => fetch(`/api/instagram/posts/${post.id}/publish`, { method: "POST" }), "Publicado no Instagram.");
  }

  function deletePost(post: Post) {
    const warning = post.status === "PUBLISHED" ? "Remover da lista? O post continua no Instagram." : `Excluir "${post.title}"?`;
    if (!window.confirm(warning)) return;
    void action(post, () => fetch(`/api/instagram/posts/${post.id}`, { method: "DELETE" }), "Post removido da fila.");
  }

  const sections: { title: string; hint: string; items: Post[] }[] = [
    { title: "Com erro", hint: "Não foram publicados — veja o motivo, ajuste e tente de novo.", items: posts.filter((post) => post.status === "FAILED") },
    { title: "Agendados", hint: "Aprovados: saem sozinhos na hora marcada.", items: posts.filter((post) => post.status === "APPROVED" || post.status === "PUBLISHING") },
    { title: "Rascunhos", hint: "Só são publicados depois de aprovados.", items: posts.filter((post) => post.status === "DRAFT") },
    { title: "Publicados", hint: "", items: posts.filter((post) => post.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")) },
  ];

  const captionLength = form.caption.length;

  return (
    <main className="admin-shell">
      <AdminHeader active="divulgacao" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver a fila de publicações." /> : null}

        <section className="library-heading">
          <div>
            <h1>Divulgação</h1>
            <p>Fila de posts do Instagram: rascunho → aprovado → publicado na hora marcada.</p>
          </div>
        </section>

        {connection ? (
          <p className={`social-banner${connection.connected && connection.autopublish ? " ok" : ""}`}>
            {!connection.connected ? <>Instagram não conectado — cole o token em <Link href="/settings">Configurações</Link>.</>
              : !connection.canPublish ? <>Conectado como @{connection.username}. Neste ambiente a publicação está desligada: os posts só saem do servidor de produção.</>
              : !connection.autopublish ? <>Conectado como @{connection.username}. Agendamento automático desligado no servidor — use &quot;Publicar agora&quot;.</>
              : <>Conectado como @{connection.username} · agendamento automático ligado.</>}
          </p>
        ) : null}

        <section className="library-layout">
          <form className="preset-form" onSubmit={savePost}>
            <h2><span>＋</span> {form.id ? "Editar post" : "Novo post"}</h2>
            <label>Imagens e legenda
              <input type="file" accept="image/*,.txt" multiple onChange={addFiles} />
              <small className="field-hint">Dica: selecione tudo da pasta do post (imagens + legenda.txt) que o tipo, o horário e a legenda vêm juntos.</small>
            </label>
            {form.images.length ? (
              <div className="social-thumbs editable">
                {form.images.map((image, index) => (
                  <figure key={image.key} className={form.kind === "STORY" ? "story" : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.preview} alt={`Imagem ${index + 1}`} />
                    <figcaption>
                      <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="Mover para a esquerda">‹</button>
                      <span>{index + 1}</span>
                      <button type="button" onClick={() => moveImage(index, 1)} disabled={index === form.images.length - 1} aria-label="Mover para a direita">›</button>
                      <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((item) => item.key !== image.key) })} aria-label={`Remover imagem ${index + 1}`}>×</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            <div className="form-grid">
              <label>Tipo<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Kind })}>{(Object.keys(KIND_LABEL) as Kind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></label>
              <label>Data e hora<input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} /></label>
            </div>
            <label>Título (só para você)<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex: Carrossel Dia das Crianças" /></label>
            {form.kind === "STORY" ? (
              <p className="field-hint">Story não leva legenda nem figurinhas (link, enquete) pela API do Instagram — o texto precisa estar na arte.</p>
            ) : (
              <label>Legenda <span className="field-hint">{captionLength}/2200</span><textarea rows={9} maxLength={2200} value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} /></label>
            )}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={busy === "form" || !form.images.length}>{busy === "form" ? "Salvando..." : form.id ? "Salvar alterações" : "Salvar rascunho"}</button>
              {form.id || form.images.length ? <button className="secondary-button" type="button" onClick={() => { setForm(emptyForm); setFeedback(""); }}>Cancelar</button> : null}
            </div>
            {feedback ? <p className="field-hint social-feedback">{feedback}</p> : null}
          </form>

          <div className="preset-column">
            {!posts.length && !needsLogin ? <p className="preset-empty">Nenhum post na fila ainda. Comece pelo formulário ao lado.</p> : null}
            {sections.filter((section) => section.items.length).map((section) => (
              <section key={section.title} className="social-section">
                <h2>{section.title} <strong>({section.items.length})</strong>{section.hint ? <span>{section.hint}</span> : null}</h2>
                <div className="preset-grid">
                  {section.items.map((post) => (
                    <article key={post.id} className={`preset-card social-card status-${post.status.toLowerCase()}`}>
                      <div className="card-top">
                        <span className="material-badge">{KIND_LABEL[post.kind]}{post.kind === "CAROUSEL" ? ` · ${post.media.length}` : ""}</span>
                        <span className="card-actions">
                          {post.status === "DRAFT" || post.status === "FAILED" || post.status === "APPROVED" ? <button className="edit-button" onClick={() => editPost(post)}>Editar</button> : null}
                          {post.status !== "PUBLISHING" ? <button className="delete-button" onClick={() => deletePost(post)} aria-label={`Excluir ${post.title}`}><IconTrash className="nav-icon" /></button> : null}
                        </span>
                      </div>
                      <div className="social-thumbs">
                        {post.media.slice(0, 4).map((name, index) => (
                          <figure key={name} className={post.kind === "STORY" ? "story" : undefined}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(post.id, name)} alt={`${post.title} — imagem ${index + 1}`} loading="lazy" />
                          </figure>
                        ))}
                      </div>
                      <h3>{post.title}</h3>
                      <p className="card-detail">{post.status === "PUBLISHED" ? `Publicado ${formatWhen(post.publishedAt)}` : post.status === "PUBLISHING" ? "Publicando agora..." : formatWhen(post.scheduledAt)}</p>
                      {post.caption ? <p className="social-caption">{post.caption}</p> : null}
                      {post.status === "FAILED" ? <p className="social-error">{post.error}</p> : null}
                      <div className="form-actions">
                        {post.status === "DRAFT" ? <button className="primary-button" disabled={busy === post.id || !post.scheduledAt} title={post.scheduledAt ? undefined : "Defina data e hora (Editar)"} onClick={() => approve(post)}>Aprovar</button> : null}
                        {post.status === "FAILED" ? <button className="primary-button" disabled={busy === post.id} onClick={() => void setStatus(post, "APPROVED", "Aprovado de novo — sai na próxima volta do agendador.")}>Tentar de novo</button> : null}
                        {post.status === "APPROVED" ? <button className="secondary-button" disabled={busy === post.id} onClick={() => void setStatus(post, "DRAFT", "Voltou para rascunho.")}>Voltar para rascunho</button> : null}
                        {post.status === "APPROVED" && connection?.canPublish ? <button className="primary-button" disabled={busy === post.id} onClick={() => publishNow(post)}>{busy === post.id ? "Publicando..." : "Publicar agora"}</button> : null}
                        {post.status === "PUBLISHED" && post.permalink ? <a className="secondary-button" href={post.permalink} target="_blank" rel="noreferrer">Ver no Instagram</a> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
