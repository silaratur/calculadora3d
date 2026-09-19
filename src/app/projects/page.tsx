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
type SortField = "recent" | "client" | "value" | "status";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel: Record<string, string> = { DRAFT: "Rascunho", CONVERTED: "Convertido em venda", ARCHIVED: "Arquivado" };
const statusBadgeColor: Record<string, string> = { DRAFT: "#8a4a4e", CONVERTED: "#777f5d", ARCHIVED: "#602f32" };
// Mesma ideia do Catálogo: qual direção faz sentido como padrão na primeira
// vez que cada critério é escolhido (recente = mais novo, cliente = A-Z,
// valor = maior primeiro, status = A-Z).
const defaultSortDirection: Record<SortField, "asc" | "desc"> = { recent: "desc", client: "asc", value: "desc", status: "asc" };

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
  const [tab, setTab] = useState<"quotes" | "archived" | "competitors">("quotes");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [converting, setConverting] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);
  // Orçamento aguardando confirmação do motivo antes de arquivar — vira
  // "Não Executado" só depois que o motivo é informado no popup.
  const [archiveTarget, setArchiveTarget] = useState<Quote | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  // Mesmo padrão de listagem do Catálogo: ordenação, filtro e paginação.
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("recent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      const [quoteResponse, archivedResponse, competitorResponse] = await Promise.all([fetch("/api/quotes"), fetch("/api/quotes?status=ARCHIVED"), fetch("/api/competitors")]);
      if (quoteResponse.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (quoteResponse.ok) setQuotes((await quoteResponse.json()) as Quote[]);
      if (archivedResponse.ok) setArchivedQuotes((await archivedResponse.json()) as Quote[]);
      if (competitorResponse.ok) setCompetitors((await competitorResponse.json()) as Competitor[]);
    }
    void load();
  }, [reloadToken]);

  function sortQuotes(list: Quote[]) {
    const sorted = [...list];
    const sign = sortDirection === "asc" ? 1 : -1;
    if (sortBy === "recent") sorted.sort((a, b) => sign * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()));
    else if (sortBy === "client") sorted.sort((a, b) => sign * ((a.customerName || "").localeCompare(b.customerName || "") || a.productName.localeCompare(b.productName)));
    else if (sortBy === "value") sorted.sort((a, b) => sign * (a.finalPrice - b.finalPrice));
    else if (sortBy === "status") sorted.sort((a, b) => sign * ((statusLabel[a.status] ?? a.status).localeCompare(statusLabel[b.status] ?? b.status)));
    return sorted;
  }

  const filteredQuotes = useMemo(() => {
    const items = quotes.filter(
      (quote) =>
        `${quote.productName} ${quote.customerName} ${quote.code ?? ""}`.toLowerCase().includes(search.toLowerCase()) &&
        (statusFilter === "all" || quote.status === statusFilter),
    );
    return sortQuotes(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, search, statusFilter, sortBy, sortDirection]);
  const filteredArchivedQuotes = useMemo(() => {
    const items = archivedQuotes.filter((quote) => `${quote.productName} ${quote.customerName} ${quote.code ?? ""}`.toLowerCase().includes(search.toLowerCase()));
    return sortQuotes(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedQuotes, search, sortBy, sortDirection]);
  const filteredCompetitors = useMemo(() => competitors.filter((item) => `${item.productName} ${item.competitor} ${item.channel}`.toLowerCase().includes(search.toLowerCase())), [competitors, search]);

  const activeQuoteList = tab === "archived" ? filteredArchivedQuotes : filteredQuotes;
  const totalPages = Math.max(1, Math.ceil(activeQuoteList.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedQuotes = activeQuoteList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function selectTab(value: "quotes" | "archived" | "competitors") {
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

  async function convertQuote(id: string) {
    setConverting(id);
    setFeedback("");
    const response = await fetch(`/api/quotes/${id}/convert`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setConverting(null);
    if (!response.ok) { setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível converter este orçamento."); return; }
    setFeedback(`Orçamento convertido — pedido ${body.order.orderNumber} criado em Vendas.`);
    reload();
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
          <button className={tab === "archived" ? "selected" : ""} onClick={() => selectTab("archived")}>Não Executados ({filteredArchivedQuotes.length})</button>
          <button className={tab === "competitors" ? "selected" : ""} onClick={() => selectTab("competitors")}>Concorrência ({filteredCompetitors.length})</button>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        {tab === "quotes" || tab === "archived" ? (
          <>
            <div className="catalog-filters">
              <strong>{activeQuoteList.length} orçamento{activeQuoteList.length === 1 ? "" : "s"}</strong>
              <div className="catalog-sort">
                <span>Classificar por</span>
                <button type="button" className={sortBy === "recent" ? "chip selected" : "chip"} onClick={() => selectSort("recent")}>Mais Recentes{sortArrow("recent")}</button>
                <button type="button" className={sortBy === "client" ? "chip selected" : "chip"} onClick={() => selectSort("client")}>Cliente{sortArrow("client")}</button>
                <button type="button" className={sortBy === "value" ? "chip selected" : "chip"} onClick={() => selectSort("value")}>Valor{sortArrow("value")}</button>
                {tab === "quotes" ? <button type="button" className={sortBy === "status" ? "chip selected" : "chip"} onClick={() => selectSort("status")}>Status{sortArrow("status")}</button> : null}
              </div>
              <div className="catalog-filters-right">
                {tab === "quotes" ? (
                  <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                    <option value="all">Todos os status</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="CONVERTED">Convertido em venda</option>
                  </select>
                ) : null}
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
                        <button type="button" disabled={converting === quote.id} onClick={() => convertQuote(quote.id)}>
                          {converting === quote.id ? "Convertendo..." : "Converter"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {activeQuoteList.length === 0 ? (
              <div className="empty-note">{tab === "archived" ? "Nenhum orçamento arquivado ainda." : "Nenhum orçamento salvo ainda. Gere um em Orçamentos."}</div>
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
