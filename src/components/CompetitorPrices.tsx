"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { effectiveQuantity, evaluatePrice, isStale, STALE_DAYS, TARGET_MARGIN, unitPrice, type CompetitorEntry, type Position } from "@/lib/competitors";
import { brl } from "@/lib/money";

/**
 * Concorrência — aba do Catálogo. Registro manual de anúncios (Shopee, Mercado
 * Livre, Elo7…) ligados a um produto e avaliação: meu preço × mediana do
 * mercado por unidade com frete, com recomendação respeitando custo e margem.
 */
type Competitor = CompetitorEntry & { productName: string; url: string; notes: string; lastCheckStatus?: string; lastCheckAt?: string | null };
type ProductRef = { id: string; sku: string; name: string; price: number; cost: number; imageUrl?: string };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };

const CHANNELS = ["Shopee", "Mercado Livre", "Elo7", "Instagram", "Loja própria", "Outro"];
const n = (value: string) => Number(value.replace(",", ".")) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = { productId: "", competitor: "", channel: "Shopee", price: "", quantity: "1", shipping: "0", url: "", checkedAt: today(), notes: "" };
const positionLabel: Record<Position, string> = { abaixo: "🟢 Abaixo do mercado", media: "🟡 Na média", acima: "🔴 Acima do mercado", "mercado-abaixo-do-custo": "⚫ Mercado abaixo do custo" };

// Filtros e ordenação da avaliação, pensados para a revisão de preços:
// primeiro o que pede ação (subir/baixar), depois o que mudou na verificação automática.
type Filter = "todos" | "subir" | "baixar" | "media" | "custo" | "mudou" | "fora" | "desatualizado";
type Sort = "diferenca" | "ganho" | "mediana" | "nome" | "verificacao";
const RECENT_DAYS = 7;
const isUnavailable = (entry: Competitor) => entry.lastCheckStatus === "INDISPONIVEL";
const changedRecently = (entry: Competitor) => entry.lastCheckStatus === "ALTERADO" && !!entry.lastCheckAt && Date.now() - new Date(entry.lastCheckAt).getTime() < RECENT_DAYS * 86400000;
const filterLabel: Record<Filter, string> = {
  todos: "Todos", subir: "🟢 Pode subir", baixar: "🔴 Pode baixar", media: "🟡 Na média", custo: "⚫ Manter (custo/margem)",
  mudou: "Preço mudou", fora: "Anúncio fora do ar", desatualizado: "Desatualizados",
};
const sortLabel: Record<Sort, string> = { diferenca: "Maior diferença", ganho: "Ganho por peça", mediana: "% vs mediana", nome: "Nome", verificacao: "Mudou primeiro" };
// Direção padrão de cada ordenação (clicar de novo inverte, como no Catálogo).
const defaultDirection: Record<Sort, "asc" | "desc"> = { diferenca: "desc", ganho: "desc", mediana: "desc", nome: "asc", verificacao: "desc" };

export function CompetitorPrices({ search, products, marketplaces }: { search: string; products: ProductRef[]; marketplaces: Marketplace[] }) {
  const [entries, setEntries] = useState<Competitor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [filter, setFilter] = useState<Filter>("todos");
  const [sortBy, setSortBy] = useState<Sort>("diferenca");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/competitors", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Competitor[]) => { if (!cancelled) { setEntries(data); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  // Comissão estimada do canal do concorrente (Configurações → Canais de venda), pelo nome.
  const commissionOf = (channel: string) => {
    const key = channel.trim().toLowerCase();
    const match = marketplaces.find((item) => item.name.trim().toLowerCase() === key);
    return match ? match.commissionRate + match.adsRate : null;
  };

  const competitorNames = useMemo(() => Array.from(new Set(entries.map((item) => item.competitor))).sort(), [entries]);
  const query = search.trim().toLowerCase();
  const rows = useMemo(() => {
    return products
      .filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(query) || entries.some((entry) => entry.productId === product.id && entry.competitor.toLowerCase().includes(query)))
      .map((product) => {
        const own = entries.filter((entry) => entry.productId === product.id);
        // Anúncio fora do ar continua salvo (só o usuário apaga), mas não entra na mediana.
        const live = own.filter((entry) => !isUnavailable(entry));
        return {
          product,
          entries: own,
          evaluation: evaluatePrice(product, live),
          changed: own.filter(changedRecently).length,
          unavailable: own.length - live.length,
          lastCheck: Math.max(0, ...own.map((entry) => (entry.lastCheckAt ? new Date(entry.lastCheckAt).getTime() : 0))),
        };
      });
  }, [products, entries, query]);
  type Row = (typeof rows)[number];
  const withEvaluation = rows.filter((row) => row.evaluation);
  const matches: Record<Filter, (row: Row) => boolean> = {
    todos: () => true,
    subir: (row) => row.evaluation!.position === "abaixo" && row.evaluation!.suggestedPrice !== null,
    baixar: (row) => row.evaluation!.position === "acima" && row.evaluation!.suggestedPrice !== null,
    media: (row) => row.evaluation!.position === "media",
    custo: (row) => row.evaluation!.position === "mercado-abaixo-do-custo" || (row.evaluation!.position === "acima" && row.evaluation!.suggestedPrice === null),
    mudou: (row) => row.changed > 0,
    fora: (row) => row.unavailable > 0,
    desatualizado: (row) => row.evaluation!.stale > 0,
  };
  const sortValue: Record<Sort, (row: Row) => number | string> = {
    diferenca: (row) => Math.abs(row.evaluation!.diffPercent),
    ganho: (row) => (row.evaluation!.suggestedPrice ?? row.product.price) - row.product.price,
    mediana: (row) => row.evaluation!.diffPercent,
    nome: (row) => row.product.name.toLowerCase(),
    verificacao: (row) => row.changed * 1e15 + row.unavailable * 1e14 + row.lastCheck,
  };
  const evaluated = withEvaluation
    .filter(matches[filter])
    .sort((a, b) => {
      const x = sortValue[sortBy](a);
      const y = sortValue[sortBy](b);
      const order = typeof x === "string" ? x.localeCompare(String(y), "pt-BR") : x - (y as number);
      return sortDirection === "asc" ? order : -order;
    });
  const withoutReference = rows.filter((row) => !row.evaluation);

  function selectSort(value: Sort) {
    if (value === sortBy) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else { setSortBy(value); setSortDirection(defaultDirection[value]); }
  }

  function startNew(productId = "") {
    setEditingId(null);
    setForm({ ...emptyForm, productId, checkedAt: today() });
    setFormOpen(true);
  }
  function startEdit(entry: Competitor) {
    setEditingId(entry.id);
    setForm({
      productId: entry.productId ?? "",
      competitor: entry.competitor,
      channel: entry.channel || "Outro",
      price: String(entry.price).replace(".", ","),
      quantity: String(entry.quantity).replace(".", ","),
      shipping: String(entry.shipping).replace(".", ","),
      url: entry.url,
      checkedAt: entry.checkedAt.slice(0, 10),
      notes: entry.notes,
    });
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const product = products.find((item) => item.id === form.productId);
    if (!product) { setFeedback("Escolha o produto."); return; }
    const body = {
      productId: product.id,
      productName: product.name,
      competitor: form.competitor.trim(),
      channel: form.channel,
      price: n(form.price),
      quantity: effectiveQuantity(n(form.quantity)),
      shipping: n(form.shipping),
      url: form.url.trim(),
      checkedAt: form.checkedAt,
      notes: form.notes.trim(),
    };
    const response = await fetch(editingId ? `/api/competitors?id=${encodeURIComponent(editingId)}` : "/api/competitors", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) { setFeedback("Não foi possível salvar. Confira o concorrente (mín. 2 letras), o preço e o link (precisa começar com http)."); return; }
    setFeedback(editingId ? "Anúncio atualizado." : "Anúncio registrado.");
    setExpanded(product.id);
    setForm({ ...emptyForm, productId: product.id, checkedAt: today() });
    setEditingId(null);
    setReloadToken((token) => token + 1);
  }

  async function remove(entry: Competitor) {
    if (!window.confirm(`Remover o anúncio de ${entry.competitor}?`)) return;
    await fetch(`/api/competitors?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    setReloadToken((token) => token + 1);
  }

  if (!loaded) return <p className="library-loading">Carregando...</p>;
  const preview = form.price ? unitPrice({ price: n(form.price), quantity: effectiveQuantity(n(form.quantity)), shipping: n(form.shipping) }) : null;
  const formProduct = products.find((item) => item.id === form.productId);

  return (
    <div className="competitor-panel">
      <div className="competitor-toolbar">
        <p>
          Registre anúncios da Shopee, Mercado Livre e outros. A comparação usa o <b>preço por unidade com frete</b> e respeita sua margem mínima de {TARGET_MARGIN}%.
          Preços consultados há mais de {STALE_DAYS} dias ficam marcados como desatualizados.
        </p>
        <button type="button" className="primary-button" onClick={() => (formOpen && !editingId ? setFormOpen(false) : startNew())}>{formOpen && !editingId ? "Fechar" : "+ Registrar anúncio de concorrente"}</button>
      </div>
      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      {formOpen ? (
        <form className="preset-form competitor-form" onSubmit={save}>
          <h2>{editingId ? "Atualizar anúncio" : "Novo anúncio de concorrente"}</h2>
          <label>Meu produto equivalente
            <select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
              <option value="">Escolha…</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name} ({brl(product.price)})</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label>Concorrente (loja)
              <input required list="competitor-names" value={form.competitor} onChange={(event) => setForm({ ...form, competitor: event.target.value })} placeholder="Ex.: Loja 3D Criativa" />
              <datalist id="competitor-names">{competitorNames.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
            <label>Canal
              <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>{CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}</select>
            </label>
          </div>
          <div className="form-grid three">
            <label>Preço do anúncio (R$)<input required inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="Ex.: 49,90" /></label>
            <label>Peças no anúncio<input inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /><small>Peças do anúncio ÷ peças do seu produto: kit de 10 contra sua peça avulsa = 10; anúncio de 1 contra seu kit de 4 = 0,25</small></label>
            <label>Frete (R$)<input inputMode="decimal" value={form.shipping} onChange={(event) => setForm({ ...form, shipping: event.target.value })} /><small>0 = frete grátis</small></label>
          </div>
          <div className="form-grid">
            <label>Link do anúncio<input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://…" /></label>
            <label>Data da consulta<input type="date" value={form.checkedAt} onChange={(event) => setForm({ ...form, checkedAt: event.target.value })} /></label>
          </div>
          <label>Observação<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ex.: tamanho menor, só 3 cores, 1.200 vendidos" /></label>
          {preview !== null ? (
            <p className="competitor-preview">
              Por unidade com frete: <b>{brl(preview)}</b>
              {formProduct ? <> · seu preço: <b>{brl(formProduct.price)}</b> ({preview ? `${(((formProduct.price - preview) / preview) * 100).toFixed(0)}%` : "—"})</> : null}
              {commissionOf(form.channel) !== null ? <> · o concorrente recebe ~{brl(n(form.price) * (1 - (commissionOf(form.channel) ?? 0)))} líquido no {form.channel}</> : null}
            </p>
          ) : null}
          <div className="form-actions">
            <button className="primary-button" type="submit">{editingId ? "Salvar alterações" : "Registrar"}</button>
            <button className="secondary-button" type="button" onClick={() => { setFormOpen(false); setEditingId(null); }}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <h3 className="competitor-section-title">Avaliação de preços ({withEvaluation.length} produtos com referência)</h3>
      {withEvaluation.length ? (
        <div className="competitor-filters">
          <div className="catalog-sort">
            <span>Mostrar</span>
            {(Object.keys(filterLabel) as Filter[]).map((key) => {
              const count = withEvaluation.filter(matches[key]).length;
              if (key !== "todos" && key !== filter && !count) return null;
              return <button key={key} type="button" className={filter === key ? "chip selected" : "chip"} onClick={() => setFilter(key)}>{filterLabel[key]} ({count})</button>;
            })}
          </div>
          <div className="catalog-sort">
            <span>Classificar por</span>
            {(Object.keys(sortLabel) as Sort[]).map((key) => (
              <button key={key} type="button" className={sortBy === key ? "chip selected" : "chip"} onClick={() => selectSort(key)}>
                {sortLabel[key]}{sortBy === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {withEvaluation.length && !evaluated.length ? <div className="empty-note">Nenhum produto neste filtro.</div> : null}
      {evaluated.length ? (
        <div className="competitor-table">
          <div className="competitor-row competitor-head">
            <span>Produto</span><span>Meu preço</span><span>Mercado (mín · mediana · máx)</span><span>Posição</span><span>Custo · mín. {TARGET_MARGIN}%</span><span>Recomendação</span>
          </div>
          {evaluated.map(({ product, entries: own, evaluation, changed, unavailable }) => (
            <div key={product.id} className="competitor-group">
              <button type="button" className={`competitor-row position-${evaluation!.position}`} onClick={() => setExpanded(expanded === product.id ? null : product.id)}>
                <span className="competitor-product">
                  <b>{product.name}</b>
                  <small>{product.sku} · {evaluation!.count} anúncio(s){evaluation!.stale ? ` · ${evaluation!.stale} desatualizado(s)` : ""}</small>
                  {changed || unavailable ? (
                    <span className="competitor-tags">
                      {changed ? <em className="today-tag">preço mudou ({changed})</em> : null}
                      {unavailable ? <em className="today-tag urgent">{unavailable} fora do ar</em> : null}
                    </span>
                  ) : null}
                </span>
                <span className="num">{brl(product.price)}</span>
                <span className="num">{brl(evaluation!.min)} · <b>{brl(evaluation!.median)}</b> · {brl(evaluation!.max)}</span>
                <span>{positionLabel[evaluation!.position]}<small>{evaluation!.diffPercent > 0 ? "+" : ""}{evaluation!.diffPercent.toFixed(0)}% vs mediana</small></span>
                <span className="num">{brl(product.cost)} · {brl(evaluation!.floorPrice)}</span>
                <span className="competitor-reco">
                  {evaluation!.recommendation}
                  {evaluation!.suggestedPrice ? <small className={evaluation!.suggestedPrice > product.price ? "competitor-gain up" : "competitor-gain down"}>{evaluation!.suggestedPrice > product.price ? "+" : "−"}{brl(Math.abs(evaluation!.suggestedPrice - product.price))} por peça</small> : null}
                </span>
              </button>
              {expanded === product.id ? (
                <div className="competitor-entries">
                  {own.map((entry) => {
                    const rate = commissionOf(entry.channel);
                    return (
                      <div key={entry.id} className={isUnavailable(entry) ? "competitor-entry unavailable" : isStale(entry) ? "competitor-entry stale" : "competitor-entry"}>
                        <span>
                          <b>{entry.competitor}</b> · {entry.channel || "—"}
                          {isUnavailable(entry) ? <em className="today-tag urgent">fora do ar — fora da mediana</em> : changedRecently(entry) ? <em className="today-tag">preço mudou</em> : null}
                          {entry.notes ? <small>{entry.notes}</small> : null}
                        </span>
                        <span className="num">{brl(entry.price)}{entry.quantity > 1 ? ` / ${entry.quantity} un.` : entry.quantity < 1 ? ` (= ${String(entry.quantity).replace(".", ",")} do seu kit)` : ""}{entry.shipping ? ` + ${brl(entry.shipping)} frete` : " · frete grátis"}</span>
                        <span className="num">= {brl(unitPrice(entry))}/un.{rate !== null ? <small>recebe ~{brl((entry.price * (1 - rate)) / effectiveQuantity(entry.quantity))}/un. líquido</small> : null}</span>
                        <span>{new Date(entry.checkedAt).toLocaleDateString("pt-BR")}{isStale(entry) ? <small>desatualizado</small> : null}</span>
                        <span className="competitor-entry-actions">
                          {entry.url ? <a href={entry.url} target="_blank" rel="noreferrer">Abrir</a> : null}
                          <button type="button" className="link-button" onClick={() => startEdit(entry)}>Atualizar</button>
                          <button type="button" className="link-button" onClick={() => remove(entry)}>Remover</button>
                        </span>
                      </div>
                    );
                  })}
                  <button type="button" className="secondary-button" onClick={() => startNew(product.id)}>+ Outro anúncio para {product.name}</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-note">Nenhum produto com preço de concorrente ainda. Comece pelos principais (ex.: kits e peças de Natal).</div>
      )}

      {withoutReference.length ? (
        <details className="competitor-missing">
          <summary>Sem referência de mercado ({withoutReference.length} produtos)</summary>
          <ul>
            {withoutReference.map(({ product }) => (
              <li key={product.id}>
                <span>{product.sku} — {product.name} · {brl(product.price)}</span>
                <button type="button" className="link-button" onClick={() => startNew(product.id)}>Registrar anúncio</button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
