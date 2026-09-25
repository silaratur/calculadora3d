"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { quoteStatusLabel } from "@/lib/quotes";
import { canAccessPath } from "@/lib/roles";
import { AuthBanner } from "@/components/AuthBanner";
import { IconClock, IconDownload, IconTrash, IconUser } from "@/components/Icons";
import { ProductPhotoLink } from "@/components/ProductPreview";

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
  validUntil: string | null;
  revision: number;
  order: { id: string; orderNumber: string } | null;
};
type SortField = "recent" | "client" | "value";
type QuoteItem = { name: string; quantity: number };
type ConvertForm = { shippingPaid: boolean; shippingCost: string; paymentMethod: string; plannedProductionDate: string; expectedPaymentDate: string };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;
const paymentMethods = ["PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Boleto"];
const emptyConvertForm: ConvertForm = { shippingPaid: false, shippingCost: "0", paymentMethod: "PIX", plannedProductionDate: "", expectedPaymentDate: "" };
// Número exibido sem o prefixo dos códigos antigos (ORC-/PED-): orçamento e venda compartilham a numeração.
const displayCode = (code: string | null | undefined) => (code ? `#${code.replace(/^(ORC|PED)-/, "")}` : "—");

/** "vence em 3 dias" / "vence hoje" / "vencido há 2 dias" — só pra orçamento em aberto com validade. */
function validityLabel(validUntil: string | null) {
  if (!validUntil) return null;
  const due = new Date(validUntil);
  const today = new Date();
  const days = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (days < 0) return { text: days === -1 ? "vencido ontem" : `vencido há ${-days} dias`, late: true };
  if (days === 0) return { text: "vence hoje", late: false };
  return { text: days === 1 ? "vence amanhã" : `vence em ${days} dias`, late: false };
}
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

/** Primeiro produto do Catálogo com foto incluso no orçamento, se tiver — vira a miniatura do card. */
function firstItemPhoto(snapshotJson: string): { id?: string; name?: string; imageUrl: string } | null {
  try {
    const snapshot = JSON.parse(snapshotJson) as { products?: { id?: string; name?: string; imageUrl?: string }[] };
    const item = snapshot.products?.find((entry) => entry.imageUrl);
    return item?.imageUrl ? { id: item.id, name: item.name, imageUrl: item.imageUrl } : null;
  } catch {
    return null;
  }
}

export default function ProjectsPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [archivedQuotes, setArchivedQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"quotes" | "converted" | "archived">("quotes");
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
      const [quoteResponse, archivedResponse, sessionResponse] = await Promise.all([
        fetch("/api/quotes"),
        fetch("/api/quotes?status=ARCHIVED"),
        fetch("/api/session"),
      ]);
      if (quoteResponse.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (quoteResponse.ok) setQuotes((await quoteResponse.json()) as Quote[]);
      if (archivedResponse.ok) setArchivedQuotes((await archivedResponse.json()) as Quote[]);
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

  const activeQuoteList = tab === "archived" ? filteredArchivedQuotes : tab === "converted" ? filteredConvertedQuotes : filteredQuotes;
  const totalPages = Math.max(1, Math.ceil(activeQuoteList.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedQuotes = activeQuoteList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Financeiro vê a lista (receita potencial) mas não edita — sem acesso ao editor.
  const canEdit = role !== "" && canAccessPath(role, "/orcamentos");

  function selectTab(value: "quotes" | "converted" | "archived") {
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

  // Cliente voltou: o reprovado volta pra "Em aberto".
  async function reopen(quote: Quote) {
    const response = await fetch(`/api/quotes/${quote.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen" }) });
    if (!response.ok) { setFeedback("Não foi possível reabrir este orçamento."); return; }
    setFeedback(`${displayCode(quote.code)} reaberto — está de novo em "Em aberto".`);
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
    if (!response.ok) { setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível aprovar este orçamento."); return; }
    // A venda nasce ligada ao orçamento (quoteId) e com o mesmo número — ao
    // aprovar, abre direto a página da venda nova.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/sales/${body.order.id}`;
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="projects" badges={{ projects: quotes.filter((quote) => quote.status === "DRAFT").length || undefined }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver os orçamentos." /> : null}
        <section className="library-heading">
          <div>
            <h1>Orçamentos</h1>
            <p>Em aberto enquanto negocia; aprovado vira venda; reprovado guarda o motivo.</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome, cliente ou número..." />
            <a className="new-quote-button" href="/orcamentos">＋ Novo orçamento</a>
          </div>
        </section>

        <div className="project-tabs">
          <button className={tab === "quotes" ? "selected" : ""} onClick={() => selectTab("quotes")}>Em aberto ({filteredQuotes.length})</button>
          <button className={tab === "converted" ? "selected" : ""} onClick={() => selectTab("converted")}>Aprovados ({filteredConvertedQuotes.length})</button>
          <button className={tab === "archived" ? "selected" : ""} onClick={() => selectTab("archived")}>Reprovados ({filteredArchivedQuotes.length})</button>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

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
                const approved = quote.status === "CONVERTED";
                const validity = quote.status === "DRAFT" ? validityLabel(quote.validUntil) : null;
                return (
                  <article className="product-card" key={quote.id}>
                    <div className="product-card-photo">
                      {photo ? (
                        <ProductPhotoLink productId={photo.id} name={photo.name ?? quote.productName} image={photo.imageUrl}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                          <img src={photo.imageUrl} alt={photo.name ?? quote.productName} />
                        </ProductPhotoLink>
                      ) : (
                        <span className="product-card-photo-placeholder">{quote.productName.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="product-card-category" style={{ background: statusBadgeColor[quote.status] ?? "#8a4a4e" }}>
                        {quoteStatusLabel[quote.status] ?? quote.status}
                      </span>
                      {!canEdit ? null : approved ? (
                        <span className="product-card-photo-actions">
                          <a className="edit-button" href={`/orcamentos?quoteId=${quote.id}`}>Ver</a>
                        </span>
                      ) : !archived ? (
                        <span className="product-card-photo-actions">
                          <a className="edit-button" href={`/orcamentos?quoteId=${quote.id}`}>Editar</a>
                          <button type="button" className="delete-button" onClick={() => requestArchive(quote)} aria-label={`Reprovar ${quote.productName}`} title="Reprovar"><IconTrash className="nav-icon" /></button>
                        </span>
                      ) : role === "ADMIN" ? (
                        // Excluir de verdade só existe aqui (Reprovados) e só pra admin —
                        // reprovar (acima) qualquer um pode; apagar definitivo é irreversível.
                        <span className="product-card-photo-actions">
                          <button type="button" className="delete-button" onClick={() => requestDelete(quote)} aria-label={`Excluir definitivamente ${quote.productName}`}><IconTrash className="nav-icon" /></button>
                        </span>
                      ) : null}
                    </div>
                    <span className="quote-card-meta">
                      <span className="material-badge">{displayCode(quote.code)}</span>
                      {quote.revision > 1 ? <span className="quote-card-rev">Rev. {quote.revision}</span> : null}
                      {validity ? <span className={validity.late ? "quote-card-validity late" : "quote-card-validity"}>{validity.text}</span> : null}
                    </span>
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
                      {quote.status === "DRAFT" && canEdit ? (
                        <button type="button" onClick={() => openConvert(quote)}>Aprovar</button>
                      ) : null}
                      {approved && quote.order ? <a className="quote-card-sale" href={`/sales/${quote.order.id}`}>Ver venda</a> : null}
                      {archived && canEdit ? <button type="button" onClick={() => void reopen(quote)}>Reabrir</button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {activeQuoteList.length === 0 ? (
              <div className="empty-note">
                {tab === "archived"
                  ? "Nenhum orçamento reprovado."
                  : tab === "converted"
                    ? "Nenhum orçamento aprovado ainda."
                    : "Nenhum orçamento em aberto. Crie um em “Novo orçamento”."}
              </div>
            ) : null}
            <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          </>
      </div>

      {archiveTarget ? (
        <div className="modal-backdrop" onClick={cancelArchive}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Reprovar orçamento</h2>
            <p>
              <strong>{archiveTarget.productName}</strong> — {archiveTarget.customerName || "Cliente não informado"}
            </p>
            <label>
              Por que o cliente não fechou?
              <textarea
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder="Ex: Cliente desistiu, preço não fechou, prazo não atendido..."
                autoFocus
              />
            </label>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={cancelArchive}>Cancelar</button>
              <button className="primary-button" type="button" disabled={!archiveReason.trim()} onClick={confirmArchive}>Reprovar</button>
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
            <p className="modal-warning">Essa ação não pode ser desfeita. O orçamento será apagado por completo, junto com o motivo e o histórico de revisões.</p>
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
            <h2>Aprovar orçamento</h2>
            <p>
              O cliente fechou: <strong>{displayCode(convertTarget.code)}</strong> — {convertTarget.productName} vira uma venda com o mesmo número e as peças entram na fila de Produção.
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
              <button className="primary-button" type="button" disabled={converting} onClick={confirmConvert}>{converting ? "Aprovando..." : "Aprovar e criar venda"}</button>
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
