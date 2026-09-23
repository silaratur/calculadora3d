"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconClock, IconDownload, IconTrash, IconUser } from "@/components/Icons";

type Quote = {
  id: string;
  code: string | null;
  productName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: string;
  baseCost: number;
  finalPrice: number;
  margin: number;
  notes: string;
  archiveReason: string;
  snapshotJson: string;
  createdAt: string;
  updatedAt: string;
};
type Competitor = { id: string; productName: string; competitor: string; channel: string; price: number; url: string; checkedAt: string };
type SortField = "recent" | "client" | "value";
type QuoteItem = { name: string; quantity: number };
type ConvertForm = { shippingPaid: boolean; shippingCost: string; paymentMethod: string; plannedProductionDate: string; expectedPaymentDate: string };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;
const paymentMethods = ["PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Boleto"];
const emptyConvertForm: ConvertForm = { shippingPaid: false, shippingCost: "0", paymentMethod: "PIX", plannedProductionDate: "", expectedPaymentDate: "" };
const statusLabel: Record<string, string> = { DRAFT: "Orçamento", CONVERTED: "Convertido em venda", ARCHIVED: "Arquivado" };
const statusBadgeColor: Record<string, string> = { DRAFT: "#8a4a4e", CONVERTED: "#777f5d", ARCHIVED: "#602f32" };

/** Itens, canal e desconto do orçamento — mostrados como leitura no popup de conversão, nenhum deles editável ali. */
function convertPreview(snapshotJson: string): { items: QuoteItem[]; marketplaceName: string; discount: number } {
  try {
    const snapshot = JSON.parse(snapshotJson) as { products?: { name: string; quantity?: number }[]; marketplace?: { name?: string }; discount?: string };
    return {
      items: snapshot.products?.map((item) => ({ name: item.name, quantity: item.quantity || 1 })) ?? [],
      marketplaceName: snapshot.marketplace?.name || "Venda Direta",
      discount: Number(snapshot.discount) || 0,
    };
  } catch {
    return { items: [], marketplaceName: "Venda Direta", discount: 0 };
  }
}
// Mesma ideia do Catálogo: qual direção faz sentido como padrão na primeira
// vez que cada critério é escolhido (recente = mais novo, cliente = A-Z,
// valor = maior primeiro, status = A-Z).
const defaultSortDirection: Record<SortField, "asc" | "desc"> = { recent: "desc", client: "asc", value: "desc" };

/** Foto do primeiro produto do Catálogo incluso no orçamento, se tiver — vira a miniatura do card. */
function firstItemPhoto(snapshotJson: string): string | null {
  try {
    const snapshot = JSON.parse(snapshotJson) as { products?: { imageUrl?: string }[] };
    return snapshot.products?.find((item) => item.imageUrl)?.imageUrl ?? null;
  } catch {
    return null;
  }
}

export default function ProjectsPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [archivedQuotes, setArchivedQuotes] = useState<Quote[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"quotes" | "converted" | "archived" | "competitors">("quotes");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [feedback, setFeedback] = useState("");
  // Orçamento em processo de virar pedido — abre o popup de conversão, que já
  // traz itens/cliente/canal/desconto do orçamento (só leitura) e pede os
  // dados que são da venda em si (frete, pagamento, datas).
  const [convertTarget, setConvertTarget] = useState<Quote | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertForm>(emptyConvertForm);
  const [converting, setConverting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);
  // Orçamento aguardando confirmação do motivo antes de arquivar — vira
  // "Não Executado" só depois que o motivo é informado no popup.
  const [archiveTarget, setArchiveTarget] = useState<Quote | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  // Exclusão definitiva de um "Não Executado" — só admin, com confirmação
  // separada (é irreversível, diferente de arquivar).
  const [role, setRole] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Mesmo padrão de listagem do Catálogo: ordenação e paginação. O filtro por
  // status virou aba (Orçamentos/Convertidos/Não Executados) — orçamento e
  // venda não se misturam mais na mesma lista.
  const [sortBy, setSortBy] = useState<SortField>("recent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      const [quoteResponse, archivedResponse, competitorResponse, sessionResponse] = await Promise.all([
        fetch("/api/quotes"),
        fetch("/api/quotes?status=ARCHIVED"),
        fetch("/api/competitors"),
        fetch("/api/session"),
      ]);
      if (quoteResponse.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (quoteResponse.ok) setQuotes((await quoteResponse.json()) as Quote[]);
      if (archivedResponse.ok) setArchivedQuotes((await archivedResponse.json()) as Quote[]);
      if (competitorResponse.ok) setCompetitors((await competitorResponse.json()) as Competitor[]);
      if (sessionResponse.ok) { const session = (await sessionResponse.json()) as { role?: string }; setRole(session.role ?? ""); }
    }
    void load();
  }, [reloadToken]);

  function sortQuotes(list: Quote[]) {
    const sorted = [...list];
    const sign = sortDirection === "asc" ? 1 : -1;
    if (sortBy === "recent") sorted.sort((a, b) => sign * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()));
    else if (sortBy === "client") sorted.sort((a, b) => sign * ((a.customerName || "").localeCompare(b.customerName || "") || a.productName.localeCompare(b.productName)));
    else if (sortBy === "value") sorted.sort((a, b) => sign * (a.finalPrice - b.finalPrice));
    return sorted;
  }

  const matchesSearch = (quote: Quote) => `${quote.productName} ${quote.customerName} ${quote.code ?? ""}`.toLowerCase().includes(search.toLowerCase());
  // Aba "Orçamentos" só traz o que ainda está em orçamento (nem virou venda,
  // nem foi arquivado) — convertido tem aba própria, não se mistura aqui.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredQuotes = useMemo(() => sortQuotes(quotes.filter((quote) => quote.status === "DRAFT" && matchesSearch(quote))), [quotes, search, sortBy, sortDirection]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredConvertedQuotes = useMemo(() => sortQuotes(quotes.filter((quote) => quote.status === "CONVERTED" && matchesSearch(quote))), [quotes, search, sortBy, sortDirection]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredArchivedQuotes = useMemo(() => sortQuotes(archivedQuotes.filter(matchesSearch)), [archivedQuotes, search, sortBy, sortDirection]);
  const filteredCompetitors = useMemo(() => competitors.filter((item) => `${item.productName} ${item.competitor} ${item.channel}`.toLowerCase().includes(search.toLowerCase())), [competitors, search]);

  const activeQuoteList = tab === "archived" ? filteredArchivedQuotes : tab === "converted" ? filteredConvertedQuotes : filteredQuotes;
  const totalPages = Math.max(1, Math.ceil(activeQuoteList.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedQuotes = activeQuoteList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function selectTab(value: "quotes" | "converted" | "archived" | "competitors") {
    setTab(value);
    setPage(1);
  }
  function sortArrow(value: SortField) {
    if (sortBy !== value) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }
  function selectSort(value: SortField) {
    // Clicar de novo no mesmo critério já selecionado inverte a direção;
    // trocar de critério usa o padrão de cada um (igual ao Catálogo).
    if (value === sortBy) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else { setSortBy(value); setSortDirection(defaultSortDirection[value]); }
    setPage(1);
  }

  function requestArchive(quote: Quote) {
    setArchiveTarget(quote);
    setArchiveReason("");
  }
  function cancelArchive() {
    setArchiveTarget(null);
    setArchiveReason("");
  }
  async function confirmArchive() {
    if (!archiveTarget || !archiveReason.trim()) return;
    await fetch(`/api/quotes?id=${encodeURIComponent(archiveTarget.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: archiveReason.trim() }),
    });
    setArchiveTarget(null);
    setArchiveReason("");
    reload();
  }

  function requestDelete(quote: Quote) {
    setDeleteTarget(quote);
  }
  function cancelDelete() {
    setDeleteTarget(null);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const response = await fetch(`/api/quotes/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível excluir este orçamento.");
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    reload();
  }

  function openConvert(quote: Quote) {
    setConvertTarget(quote);
    setConvertForm(emptyConvertForm);
    setFeedback("");
  }
  function cancelConvert() {
    setConvertTarget(null);
  }
  async function confirmConvert() {
    if (!convertTarget) return;
    setConverting(true);
    const response = await fetch(`/api/quotes/${convertTarget.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shippingCost: convertForm.shippingPaid ? n(convertForm.shippingCost) : 0,
        paymentMethod: convertForm.paymentMethod,
        plannedProductionDate: convertForm.plannedProductionDate || null,
        expectedPaymentDate: convertForm.expectedPaymentDate || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setConverting(false);
    if (!response.ok) { setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível converter este orçamento."); return; }
    // Rastreabilidade: o pedido já nasce ligado ao orçamento (quoteId) — a
    // volta pro orçamento fica no botão "Editar" do card. Ao confirmar, leva
    // direto pra Vendas já com o pedido novo em destaque.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/sales?highlight=${body.order.id}`;
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="projects" badges={{ projects: quotes.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver orçamentos e preços de concorrência." /> : null}
        <section className="library-heading">
          <div>
            <h1>Projetos & Orçamentos Salvos</h1>
            <p>Consulte, compare e arquive os orçamentos gerados em Orçamentos.</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome, cliente, código ou canal..." />
            <a className="new-quote-button" href="/orcamentos">＋ Novo</a>
          </div>
        </section>

        <div className="project-tabs">
          <button className={tab === "quotes" ? "selected" : ""} onClick={() => selectTab("quotes")}>Orçamentos ({filteredQuotes.length})</button>
          <button className={tab === "converted" ? "selected" : ""} onClick={() => selectTab("converted")}>Convertidos em Venda ({filteredConvertedQuotes.length})</button>
          <button className={tab === "archived" ? "selected" : ""} onClick={() => selectTab("archived")}>Não Executados ({filteredArchivedQuotes.length})</button>
          <button className={tab === "competitors" ? "selected" : ""} onClick={() => selectTab("competitors")}>Concorrência ({filteredCompetitors.length})</button>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        {tab === "quotes" || tab === "converted" || tab === "archived" ? (
          <>
            <div className="catalog-filters">
              <strong>{activeQuoteList.length} orçamento{activeQuoteList.length === 1 ? "" : "s"}</strong>
              <div className="catalog-sort">
                <span>Classificar por</span>
                <button type="button" className={sortBy === "recent" ? "chip selected" : "chip"} onClick={() => selectSort("recent")}>Mais Recentes{sortArrow("recent")}</button>
                <button type="button" className={sortBy === "client" ? "chip selected" : "chip"} onClick={() => selectSort("client")}>Cliente{sortArrow("client")}</button>
                <button type="button" className={sortBy === "value" ? "chip selected" : "chip"} onClick={() => selectSort("value")}>Valor{sortArrow("value")}</button>
              </div>
              <div className="catalog-filters-right">
                <label className="items-per-page">Por página
                  <select value={itemsPerPage} onChange={(event) => { setItemsPerPage(Number(event.target.value)); setPage(1); }}>
                    {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="product-grid product-grid-compact">
              {paginatedQuotes.map((quote) => {
                const photo = firstItemPhoto(quote.snapshotJson);
                const archived = quote.status === "ARCHIVED";
                return (
                  <article className="product-card" key={quote.id}>
                    <div className="product-card-photo">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso
                        <img src={photo} alt={quote.productName} />
                      ) : (
                        <span className="product-card-photo-placeholder">{quote.productName.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="product-card-category" style={{ background: statusBadgeColor[quote.status] ?? "#8a4a4e" }}>
                        {archived ? "Não executado" : statusLabel[quote.status] ?? quote.status}
                      </span>
                      {!archived ? (
                        <span className="product-card-photo-actions">
                          <a className="edit-button" href={`/orcamentos?quoteId=${quote.id}`}>Editar</a>
                          <button type="button" className="delete-button" onClick={() => requestArchive(quote)} aria-label={`Excluir ${quote.productName}`}><IconTrash className="nav-icon" /></button>
                        </span>
                      ) : role === "ADMIN" ? (
                        // Excluir de verdade só existe aqui (Não Executados) e só pra admin —
                        // arquivar (acima) qualquer um pode; apagar definitivo é irreversível.
                        <span className="product-card-photo-actions">
                          <button type="button" className="delete-button" onClick={() => requestDelete(quote)} aria-label={`Excluir definitivamente ${quote.productName}`}><IconTrash className="nav-icon" /></button>
                        </span>
                      ) : null}
                    </div>
                    <span className="material-badge">{quote.code ?? "—"}</span>
                    <h2>{quote.productName}</h2>
                    <div className="product-card-prices">
                      <div><span>Custo</span><strong>{brl(quote.baseCost)}</strong></div>
                      <div><span>Preço</span><strong className="price-highlight">{brl(quote.finalPrice)}</strong></div>
                    </div>
                    <div className="product-card-stats">
                      <span><IconUser className="nav-icon" /> {quote.customerName || "Sem cliente"}</span>
                      <span><IconClock className="nav-icon" /> {new Date(quote.updatedAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {archived && quote.archiveReason ? <p className="project-card-archive-reason">Motivo: {quote.archiveReason}</p> : null}
                    <div className="quote-card-actions">
                      <a href={`/quotes/${quote.id}/print`} target="_blank" rel="noreferrer"><IconDownload className="nav-icon" /> PDF</a>
                      {!archived && quote.status !== "CONVERTED" ? (
                        <button type="button" onClick={() => openConvert(quote)}>Converter</button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {activeQuoteList.length === 0 ? (
              <div className="empty-note">
                {tab === "archived"
                  ? "Nenhum orçamento arquivado ainda."
                  : tab === "converted"
                    ? "Nenhum orçamento convertido em venda ainda."
                    : "Nenhum orçamento salvo ainda. Gere um em Orçamentos."}
              </div>
            ) : null}
            <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          </>
        ) : (
          <div className="project-list">
            {filteredCompetitors.length ? filteredCompetitors.map((item) => (
              <article className="project-card competitor-card" key={item.id}>
                <div className="project-card-top">
                  <span className="material-badge">CONCORRÊNCIA</span>
                  <span>{new Date(item.checkedAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="project-card-heading">
                  <div>
                    <h2>{item.productName}</h2>
                    <p>{item.competitor} · {item.channel || "Canal não informado"}</p>
                  </div>
                  <strong>{brl(item.price)}</strong>
                </div>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Abrir anúncio</a> : null}
              </article>
            )) : <div className="empty-note">Nenhum preço de concorrência cadastrado ainda.</div>}
          </div>
        )}
      </div>

      {archiveTarget ? (
        <div className="modal-backdrop" onClick={cancelArchive}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Arquivar orçamento</h2>
            <p>
              <strong>{archiveTarget.productName}</strong> — {archiveTarget.customerName || "Cliente não informado"}
            </p>
            <label>
              Por que este orçamento não vai ser executado?
              <textarea
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder="Ex: Cliente desistiu, preço não fechou, prazo não atendido..."
                autoFocus
              />
            </label>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={cancelArchive}>Cancelar</button>
              <button className="primary-button" type="button" disabled={!archiveReason.trim()} onClick={confirmArchive}>Arquivar</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" onClick={cancelDelete}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Excluir orçamento definitivamente</h2>
            <p>
              <strong>{deleteTarget.productName}</strong> — {deleteTarget.customerName || "Cliente não informado"}
            </p>
            <p className="modal-warning">Essa ação não pode ser desfeita. O orçamento será apagado por completo, junto com o motivo de arquivamento.</p>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={cancelDelete}>Cancelar</button>
              <button className="primary-button modal-danger" type="button" disabled={deleting} onClick={confirmDelete}>{deleting ? "Excluindo..." : "Excluir definitivamente"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {convertTarget ? (
        <div className="modal-backdrop" onClick={cancelConvert}>
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            <h2>Converter em Venda</h2>
            <p>
              <strong>{convertTarget.code ?? convertTarget.productName}</strong> — {convertTarget.productName}
            </p>

            {(() => {
              const preview = convertPreview(convertTarget.snapshotJson);
              return (
                <div className="convert-summary">
                  {preview.items.length ? (
                    <div className="convert-summary-block">
                      <span>Itens do orçamento</span>
                      <ul>
                        {preview.items.map((item, index) => (
                          <li key={index}>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="convert-summary-row">
                    <span>Cliente</span>
                    <div className="convert-summary-value">
                      <strong>{convertTarget.customerName || "Cliente não informado"}</strong>
                      {convertTarget.customerPhone || convertTarget.customerEmail ? (
                        <small>{[convertTarget.customerPhone, convertTarget.customerEmail].filter(Boolean).join(" · ")}</small>
                      ) : null}
                    </div>
                  </div>
                  <div className="convert-summary-row"><span>Canal de vendas</span><strong>{preview.marketplaceName}</strong></div>
                  <div className="convert-summary-row"><span>Desconto no pedido</span><strong>{brl(preview.discount)}</strong></div>
                  <div className="convert-summary-row total"><span>Valor do orçamento</span><strong>{brl(convertTarget.finalPrice)}</strong></div>
                </div>
              );
            })()}

            <a className="edit-button convert-edit-link" href={`/orcamentos?quoteId=${convertTarget.id}`}>Não é isso? Editar orçamento</a>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={convertForm.shippingPaid}
                onChange={(event) => setConvertForm({ ...convertForm, shippingPaid: event.target.checked })}
              />
              Frete pago pela empresa
            </label>
            {convertForm.shippingPaid ? (
              <label>Valor do frete (R$)
                <input inputMode="decimal" value={convertForm.shippingCost} onChange={(event) => setConvertForm({ ...convertForm, shippingCost: event.target.value })} placeholder="0,00" autoFocus />
              </label>
            ) : null}

            <label>Forma de pagamento
              <select value={convertForm.paymentMethod} onChange={(event) => setConvertForm({ ...convertForm, paymentMethod: event.target.value })}>
                {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <div className="form-grid">
              <label>Data prevista de produção
                <input type="date" value={convertForm.plannedProductionDate} onChange={(event) => setConvertForm({ ...convertForm, plannedProductionDate: event.target.value })} />
              </label>
              <label>Data prevista de recebimento
                <input type="date" value={convertForm.expectedPaymentDate} onChange={(event) => setConvertForm({ ...convertForm, expectedPaymentDate: event.target.value })} />
              </label>
            </div>

            {feedback ? <p className="admin-feedback">{feedback}</p> : null}
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={cancelConvert}>Cancelar</button>
              <button className="primary-button" type="button" disabled={converting} onClick={confirmConvert}>{converting ? "Convertendo..." : "Confirmar e criar pedido"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Páginas de orçamentos">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Página anterior">‹</button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
        <button type="button" key={item} className={item === page ? "selected" : ""} onClick={() => onChange(item)}>{item}</button>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="Próxima página">›</button>
    </nav>
  );
}
