"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { IconFileText } from "@/components/Icons";
import { ProductPhotoLink } from "@/components/ProductPreview";
import { displayNumber } from "@/lib/sales";

type Customer = { id: string; name: string };
type OrderQuote = { id: string; code: string | null };
type Order = {
  id: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  channel: string;
  totalAmount: number;
  paymentStatus: string;
  dueDate: string | null;
  customer?: Customer | null;
  quote?: OrderQuote | null;
};
type ProductionItem = {
  id: string;
  name: string;
  quantity: number;
  status: string;
  completedAt: string | null;
  product?: { id: string; imageUrl: string; material: string; printTimeHours: number } | null;
};
type Job = {
  id: string;
  status: string;
  priority: string;
  printerName: string;
  plannedMinutes: number;
  notes: string;
  order: Order;
  items: ProductionItem[];
};
type Printer = { id: string; model: string };

const STATUSES = [
  { id: "WAITING", label: "Fila", hint: "Aguardando impressão" },
  { id: "PRINTING", label: "Imprimindo", hint: "Na impressora" },
  { id: "FINISHING", label: "Acabamento", hint: "Pós-processamento e embalagem" },
  { id: "COMPLETED", label: "Concluído", hint: "Baixa o estoque do material automaticamente" },
] as const;

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hours = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes}min`);

function jobDone(job: Job) {
  return job.items.length > 0 && job.items.every((item) => item.status === "COMPLETED");
}
function jobDoneCount(job: Job) {
  return job.items.filter((item) => item.status === "COMPLETED").length;
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Aba escolhida na lista do celular; null = primeira etapa que tem peça.
  const [mobileLane, setMobileLane] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const [jobResponse, printerResponse] = await Promise.all([
        fetch("/api/production"),
        fetch("/api/printers"),
      ]);
      if (jobResponse.status === 401) {
        setNeedsLogin(true);
        return;
      }
      setNeedsLogin(false);
      const loadedPrinters = printerResponse.ok ? ((await printerResponse.json()) as Printer[]) : [];
      setPrinters(loadedPrinters);
      let loadedJobs = jobResponse.ok ? ((await jobResponse.json()) as Job[]) : [];

      // Só existe uma impressora cadastrada — já atribui ela nos pedidos sem
      // impressora, em vez de obrigar escolher manualmente algo que só pode
      // ser uma opção. Some sozinho assim que uma 2ª impressora for cadastrada.
      if (loadedPrinters.length === 1) {
        const onlyPrinter = loadedPrinters[0].model;
        const toAssign = loadedJobs.filter((job) => !job.printerName.trim());
        if (toAssign.length) {
          loadedJobs = loadedJobs.map((job) => (job.printerName.trim() ? job : { ...job, printerName: onlyPrinter }));
          void Promise.all(
            toAssign.map((job) =>
              fetch(`/api/production?id=${encodeURIComponent(job.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ printerName: onlyPrinter }),
              }),
            ),
          );
        }
      }
      setJobs(loadedJobs);
    }
    void load();
  }, [reloadToken]);

  async function updateJob(job: Job, patch: Partial<Pick<Job, "priority" | "printerName" | "notes">>) {
    setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, ...patch } : item)));
    const response = await fetch(`/api/production?id=${encodeURIComponent(job.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setFeedback("Não foi possível atualizar o pedido. Verifique o login e tente novamente.");
      reload();
      return;
    }
    setFeedback(`${displayNumber(job.order.orderNumber)} atualizado.`);
  }

  async function moveItem(job: Job, item: ProductionItem, direction: 1 | -1) {
    const index = STATUSES.findIndex((column) => column.id === item.status);
    const target = STATUSES[(index < 0 ? 0 : index) + direction];
    if (!target) return;

    setJobs((current) =>
      current.map((j) => (j.id !== job.id ? j : { ...j, items: j.items.map((it) => (it.id === item.id ? { ...it, status: target.id } : it)) })),
    );
    const response = await fetch(`/api/production/items?id=${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: target.id }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível mover a peça. Verifique o login e tente novamente.");
      reload();
      return;
    }
    setFeedback(`${item.name} (${displayNumber(job.order.orderNumber)}) → ${target.label}.`);
  }

  const visible = useMemo(() => (showCompleted ? jobs : jobs.filter((job) => !jobDone(job))), [jobs, showCompleted]);
  const laneCounts = useMemo(() => {
    const counts: Record<string, number> = { WAITING: 0, PRINTING: 0, FINISHING: 0, COMPLETED: 0 };
    visible.forEach((job) => job.items.forEach((item) => {
      if (item.status === "COMPLETED" && !showCompleted) return;
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }));
    return counts;
  }, [visible, showCompleted]);

  // Nome da impressora -> peça que já está imprimindo nela agora, pra travar
  // o botão "Avançar" na hora (sem round-trip) quando a impressora escolhida
  // já estiver ocupada — mesma regra checada de novo no servidor.
  const printerInUse = useMemo(() => {
    const map = new Map<string, { itemId: string; itemName: string; orderNumber: string }>();
    jobs.forEach((job) => {
      const printerName = job.printerName.trim();
      if (!printerName) return;
      job.items.forEach((item) => {
        if (item.status === "PRINTING") map.set(printerName, { itemId: item.id, itemName: item.name, orderNumber: job.order.orderNumber });
      });
    });
    return map;
  }, [jobs]);

  // Regra da bancada: uma impressora só imprime uma peça de cada vez — sem
  // impressora escolhida no pedido não dá pra checar isso, então trava o avanço
  // pra Imprimindo (em vez de deixar ir, o servidor recusar e a peça "piscar").
  function advanceBlock(job: Job, item: ProductionItem) {
    const index = STATUSES.findIndex((column) => column.id === item.status);
    const nextStatus = STATUSES[index + 1]?.id;
    const printerName = job.printerName.trim();
    const needsPrinterFirst = nextStatus === "PRINTING" && !printerName;
    const busyWith = nextStatus === "PRINTING" && printerName ? printerInUse.get(printerName) : undefined;
    const printerBusy = Boolean(busyWith && busyWith.itemId !== item.id);
    const reason = needsPrinterFirst
      ? "Escolha a impressora deste pedido antes de mover para Imprimindo."
      : printerBusy && busyWith
        ? `A impressora "${printerName}" já está imprimindo "${busyWith.itemName}" (pedido ${busyWith.orderNumber}).`
        : null;
    return { needsPrinterFirst, blocked: needsPrinterFirst || printerBusy, reason };
  }

  const activeMobileLane = mobileLane ?? STATUSES.find((column) => (laneCounts[column.id] ?? 0) > 0)?.id ?? "WAITING";
  const mobileItems = visible.flatMap((job) =>
    job.items
      .filter((item) => item.status === activeMobileLane && (showCompleted || item.status !== "COMPLETED"))
      .map((item) => ({ job, item })),
  );

  const open = jobs.filter((job) => !jobDone(job));
  const plannedMinutes = open.reduce((total, job) => total + job.plannedMinutes, 0);
  const urgent = open.filter((job) => job.priority === "URGENT" || job.priority === "HIGH").length;
  const late = open.filter((job) => job.order.dueDate && new Date(job.order.dueDate) < new Date()).length;

  return (
    <main className="admin-shell">
      <AdminHeader active="production" badges={{ production: open.length }} />

      <div className="admin-content">
        {needsLogin ? (
          <div className="admin-auth-banner">
            <div>
              <strong>Sessão expirada</strong>
              <p>Entre na calculadora para carregar a fila de produção.</p>
            </div>
            <Link className="primary-button" href="/">Ir para o login</Link>
          </div>
        ) : null}

        <section className="library-heading">
          <div>
            <h1>Fila de Produção</h1>
            <p>Cada peça do pedido se move sozinha — o pedido só fecha quando a última chegar em Concluído.</p>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <section className="production-stats">
          <div><span>Pedidos abertos</span><strong>{open.length}</strong></div>
          <div><span>Tempo planejado</span><strong>{hours(plannedMinutes)}</strong></div>
          <div><span>Prioridade alta</span><strong>{urgent}</strong></div>
          <div><span>Prazo vencido</span><strong>{late}</strong></div>
        </section>

        <div className="project-tools" style={{ marginBottom: 16 }}>
          <button className={showCompleted ? "selected" : ""} onClick={() => setShowCompleted(!showCompleted)} type="button">
            {showCompleted ? "Ocultar concluídos" : "Mostrar concluídos"}
          </button>
          <Link className="new-quote-button" href="/sales">＋ Novo pedido</Link>
        </div>

        {/* Celular (fase 2): o quadro de 5 colunas não cabe em 390px — vira uma
            lista por etapa, com um botão largo que diz para onde a peça vai. */}
        <section className="production-mobile" aria-label="Peças por etapa">
          <div className="production-mobile-tabs" role="tablist">
            {STATUSES.filter((column) => showCompleted || column.id !== "COMPLETED").map((column) => (
              <button
                key={column.id}
                type="button"
                role="tab"
                aria-selected={activeMobileLane === column.id}
                className={activeMobileLane === column.id ? "selected" : undefined}
                onClick={() => setMobileLane(column.id)}
              >
                {column.label} <b>{laneCounts[column.id] ?? 0}</b>
              </button>
            ))}
          </div>
          {mobileItems.length === 0 ? <p className="today-empty">Nenhuma peça em {STATUSES.find((column) => column.id === activeMobileLane)?.label ?? "esta etapa"}.</p> : null}
          {mobileItems.map(({ job, item }) => {
            const index = STATUSES.findIndex((column) => column.id === item.status);
            const next = STATUSES[index + 1];
            const minutes = item.product ? Math.round(item.product.printTimeHours * item.quantity * 60) : 0;
            const block = advanceBlock(job, item);
            return (
              <article className={`production-mobile-card lane-${item.status.toLowerCase()}`} key={item.id}>
                <div className="production-mobile-top">
                  {item.product?.imageUrl ? (
                    <ProductPhotoLink productId={item.product.id} name={item.name} image={item.product.imageUrl}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                      <img src={item.product.imageUrl} alt={item.name} />
                    </ProductPhotoLink>
                  ) : <span className="production-mobile-photo-empty" aria-hidden="true" />}
                  <div>
                    <strong>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
                    <small>{displayNumber(job.order.orderNumber)} · {job.order.customer?.name || "Cliente não informado"}</small>
                    <small>{[item.product?.material, minutes ? hours(minutes) : null, job.priority === "URGENT" ? "urgente" : job.priority === "HIGH" ? "prioridade alta" : null].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>
                {block.needsPrinterFirst ? (
                  <label className="production-mobile-printer">
                    Impressora do pedido
                    <select value={job.printerName} onChange={(event) => void updateJob(job, { printerName: event.target.value })}>
                      <option value="">Escolha a impressora</option>
                      {printers.map((printer) => <option key={printer.id} value={printer.model}>{printer.model}</option>)}
                    </select>
                  </label>
                ) : null}
                {next && item.status !== "COMPLETED" ? (
                  <button type="button" className="primary-button production-mobile-advance" disabled={block.blocked} onClick={() => void moveItem(job, item, 1)}>
                    {next.id === "COMPLETED" ? "Concluir peça" : `Mover para ${next.label}`}
                  </button>
                ) : null}
                {block.reason && !block.needsPrinterFirst ? <p className="production-mobile-reason">{block.reason}</p> : null}
                {index > 0 && item.status !== "COMPLETED" ? (
                  <button type="button" className="production-mobile-back" onClick={() => void moveItem(job, item, -1)}>
                    Voltar para {STATUSES[index - 1].label}
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>

        <div className="swimlanes-scroll">
          <div className="swimlanes">
            <div className="swim-head-cell swim-order-col">Pedido</div>
            {STATUSES.map((column) => (
              <div className="swim-head-cell swim-lane-col" key={column.id}>
                <span className={`lane-dot lane-${column.id.toLowerCase()}`} />
                <div>
                  <strong>{column.label}</strong>
                  <small>{column.hint}</small>
                </div>
                <span className="material-badge">{laneCounts[column.id] ?? 0}</span>
              </div>
            ))}

            {visible.map((job) => {
              const dueDate = job.order.dueDate ? new Date(job.order.dueDate) : null;
              const isLate = Boolean(dueDate && dueDate < new Date() && !jobDone(job));
              const done = jobDoneCount(job);
              const total = job.items.length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isDone = jobDone(job);

              return (
                <div className={`swim-row${isDone ? " done" : ""}`} key={job.id}>
                  <div className="swim-order-cell">
                    <Link className="material-badge" href={`/sales/${job.order.id}`} title="Abrir a venda">{displayNumber(job.order.orderNumber)}</Link>
                    {job.order.quote?.id ? (
                      <a className="job-quote-link" href={`/quotes/${job.order.quote.id}/print`} target="_blank" rel="noreferrer" title="Abrir o orçamento original">
                        <IconFileText className="nav-icon" /> {job.order.quote.code ?? "Ver orçamento"}
                      </a>
                    ) : null}
                    <h2>{job.order.productName}</h2>
                    <p className="card-detail">
                      {job.order.customer?.name || "Cliente não informado"} · {brl(job.order.totalAmount)}
                    </p>
                    <p className={isLate ? "job-due late" : "job-due"}>
                      {dueDate ? `Prazo: ${dueDate.toLocaleDateString("pt-BR")}` : "Sem prazo definido"}
                      {isLate ? " · atrasado" : ""}
                      {job.order.paymentStatus === "PAID" ? " · pago" : " · pagamento pendente"}
                    </p>

                    <div className="swim-progress">
                      <div className="swim-progress-track"><div className="swim-progress-fill" style={{ width: `${pct}%` }} /></div>
                      <span>{done}/{total}</span>
                    </div>
                    {isDone ? <p className="swim-done-badge">✓ Pedido completo</p> : null}

                    <div className="job-fields">
                      <label>
                        Prioridade
                        <select value={job.priority} onChange={(event) => void updateJob(job, { priority: event.target.value })}>
                          <option value="NORMAL">Normal</option>
                          <option value="HIGH">Alta</option>
                          <option value="URGENT">Urgente</option>
                          <option value="LOW">Baixa</option>
                        </select>
                      </label>
                      <label>
                        Impressora
                        <select value={job.printerName} onChange={(event) => void updateJob(job, { printerName: event.target.value })}>
                          <option value="">Não atribuída</option>
                          {printers.map((printer) => <option key={printer.id} value={printer.model}>{printer.model}</option>)}
                          {job.printerName && !printers.some((printer) => printer.model === job.printerName) ? (
                            <option value={job.printerName}>{job.printerName}</option>
                          ) : null}
                        </select>
                      </label>
                    </div>
                    <label className="job-notes">
                      Observações
                      <textarea
                        defaultValue={job.notes}
                        placeholder="Cor, acabamento, cuidados de embalagem..."
                        onBlur={(event) => { if (event.target.value !== job.notes) void updateJob(job, { notes: event.target.value }); }}
                      />
                    </label>
                  </div>

                  {STATUSES.map((column, columnIndex) => {
                    // Peça concluída é terminal: sem seta pra voltar, e só aparece
                    // aqui com "Mostrar concluídos" ligado — senão a coluna Concluído
                    // ficaria lotada de peças já resolvidas, atrapalhando quem olha
                    // a fila pra priorizar o que ainda falta.
                    const itemsHere = job.items.filter((item) => item.status === column.id && (showCompleted || item.status !== "COMPLETED"));
                    return (
                      <div className="swim-lane-cell" key={column.id}>
                        {itemsHere.length === 0 ? <div className="swim-empty-slot" /> : null}
                        {itemsHere.map((item) => {
                          const isCompleted = item.status === "COMPLETED";
                          const minutes = item.product ? Math.round(item.product.printTimeHours * item.quantity * 60) : 0;
                          const block = advanceBlock(job, item);
                          return (
                            <article className={`item-card lane-${column.id.toLowerCase()}`} key={item.id}>
                              <div className="item-card-top">
                                {item.product?.imageUrl ? (
                                  <ProductPhotoLink productId={item.product.id} name={item.name} image={item.product.imageUrl}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                                    <img className="item-card-photo" src={item.product.imageUrl} alt={item.name} />
                                  </ProductPhotoLink>
                                ) : null}
                                <div className="item-card-main">
                                  <div className="item-card-name-row">
                                    <span className="item-card-name">{item.name}</span>
                                    {item.quantity > 1 ? <span className="item-card-qty">×{item.quantity}</span> : null}
                                  </div>
                                  {item.product ? (
                                    <div className="item-card-meta">
                                      {item.product.material ? <span title={item.product.material}>{item.product.material}</span> : null}
                                      {minutes > 0 ? <span>{hours(minutes)}</span> : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="item-card-controls">
                                <button type="button" disabled={columnIndex === 0 || isCompleted} onClick={() => void moveItem(job, item, -1)} aria-label={`Voltar ${item.name}`}>‹</button>
                                <button
                                  type="button"
                                  disabled={columnIndex === STATUSES.length - 1 || block.blocked}
                                  title={block.reason ?? undefined}
                                  onClick={() => void moveItem(job, item, 1)}
                                  aria-label={`Avançar ${item.name}`}
                                >
                                  ›
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {jobs.length === 0 && !needsLogin ? (
          <div className="empty-note">Nenhum job de produção ainda. Crie um pedido em Vendas para abrir a fila.</div>
        ) : null}
        {jobs.length > 0 && visible.length === 0 && !needsLogin ? (
          <div className="empty-note">Todos os pedidos abertos estão concluídos. Clique em &quot;Mostrar concluídos&quot; para vê-los.</div>
        ) : null}
      </div>
    </main>
  );
}
