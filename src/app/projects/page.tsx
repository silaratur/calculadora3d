"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";

type Quote = { id: string; productName: string; customerName: string; status: string; baseCost: number; finalPrice: number; margin: number; notes: string; archiveReason: string; createdAt: string; updatedAt: string };
type Competitor = { id: string; productName: string; competitor: string; channel: string; price: number; url: string; checkedAt: string };
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel: Record<string, string> = { DRAFT: "Rascunho", CONVERTED: "Convertido em venda", ARCHIVED: "Arquivado" };

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

  const filteredQuotes = useMemo(() => quotes.filter((quote) => `${quote.productName} ${quote.customerName}`.toLowerCase().includes(search.toLowerCase())), [quotes, search]);
  const filteredArchivedQuotes = useMemo(() => archivedQuotes.filter((quote) => `${quote.productName} ${quote.customerName}`.toLowerCase().includes(search.toLowerCase())), [archivedQuotes, search]);
  const filteredCompetitors = useMemo(() => competitors.filter((item) => `${item.productName} ${item.competitor} ${item.channel}`.toLowerCase().includes(search.toLowerCase())), [competitors, search]);

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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, cliente ou canal..." />
            <a className="new-quote-button" href="/orcamentos">＋ Novo</a>
          </div>
        </section>

        <div className="project-tabs">
          <button className={tab === "quotes" ? "selected" : ""} onClick={() => setTab("quotes")}>Orçamentos ({filteredQuotes.length})</button>
          <button className={tab === "archived" ? "selected" : ""} onClick={() => setTab("archived")}>Não Executados ({filteredArchivedQuotes.length})</button>
          <button className={tab === "competitors" ? "selected" : ""} onClick={() => setTab("competitors")}>Concorrência ({filteredCompetitors.length})</button>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        {tab === "quotes" ? (
          <div className="project-list">
            {filteredQuotes.length ? filteredQuotes.map((quote) => (
              <article className="project-card" key={quote.id}>
                <div className="project-card-top">
                  <span className="material-badge">ORÇAMENTO</span>
                  <div>
                    <span className="project-status">{statusLabel[quote.status] ?? quote.status}</span>
                    <button className="delete-button" onClick={() => requestArchive(quote)} aria-label={`Excluir ${quote.productName}`}><IconTrash className="nav-icon" /></button>
                  </div>
                </div>
                <div className="project-card-heading">
                  <div>
                    <h2>{quote.productName}</h2>
                    <p>{quote.customerName || "Cliente não informado"}</p>
                  </div>
                  <strong>{brl(quote.finalPrice)}</strong>
                </div>
                <div className="project-card-details">
                  <span>Custo base: {brl(quote.baseCost)}</span>
                  <span>Lucro: {brl(quote.margin)}</span>
                  <span>Atualizado em: {new Date(quote.updatedAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="project-card-actions">
                  <a className="load-editor-button" href={`/orcamentos?quoteId=${quote.id}`}>▱ Carregar no Editor</a>
                  <a className="load-editor-button" href={`/quotes/${quote.id}/print`} target="_blank" rel="noreferrer">🖨 Ver / Baixar PDF</a>
                  {quote.status !== "CONVERTED" ? (
                    <button className="primary-button" type="button" disabled={converting === quote.id} onClick={() => convertQuote(quote.id)}>
                      {converting === quote.id ? "Convertendo..." : "Converter em Venda"}
                    </button>
                  ) : null}
                </div>
              </article>
            )) : <div className="empty-note">Nenhum orçamento salvo ainda. Gere um em Orçamentos.</div>}
          </div>
        ) : tab === "archived" ? (
          <div className="project-list">
            {filteredArchivedQuotes.length ? filteredArchivedQuotes.map((quote) => (
              <article className="project-card project-card-archived" key={quote.id}>
                <div className="project-card-top">
                  <span className="material-badge">NÃO EXECUTADO</span>
                  <span className="project-status">Arquivado em {new Date(quote.updatedAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="project-card-heading">
                  <div>
                    <h2>{quote.productName}</h2>
                    <p>{quote.customerName || "Cliente não informado"}</p>
                  </div>
                  <strong>{brl(quote.finalPrice)}</strong>
                </div>
                {quote.archiveReason ? <p className="project-card-archive-reason">Motivo: {quote.archiveReason}</p> : null}
                <div className="project-card-actions">
                  <a className="load-editor-button" href={`/quotes/${quote.id}/print`} target="_blank" rel="noreferrer">🖨 Ver / Baixar PDF</a>
                </div>
              </article>
            )) : <div className="empty-note">Nenhum orçamento arquivado ainda.</div>}
          </div>
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
