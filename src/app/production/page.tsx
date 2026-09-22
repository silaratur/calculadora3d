"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";

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
type Job = { id: string; status: string; priority: string; printerName: string; plannedMinutes: number; completedAt: string | null; notes: string; createdAt: string; order: Order };
type Printer = { id: string; model: string };

const columns = [
  { id: "WAITING", label: "Na fila", hint: "Aguardando impressão" },
  { id: "PRINTING", label: "Imprimindo", hint: "Na impressora" },
  { id: "FINISHING", label: "Acabamento", hint: "Pós-processamento e embalagem" },
  { id: "COMPLETED", label: "Concluído", hint: "Pronto para envio — baixa o estoque do material automaticamente" },
] as const;

const priorities = [
  { id: "LOW", label: "Baixa" },
  { id: "NORMAL", label: "Normal" },
  { id: "HIGH", label: "Alta" },
  { id: "URGENT", label: "Urgente" },
] as const;

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hours = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes}min`);
const priorityLabel = (id: string) => priorities.find((item) => item.id === id)?.label ?? id;

export default function ProductionPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
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
      if (jobResponse.ok) setJobs((await jobResponse.json()) as Job[]);
      if (printerResponse.ok) setPrinters((await printerResponse.json()) as Printer[]);
    }
    void load();
  }, [reloadToken]);

  async function update(job: Job, patch: Partial<Pick<Job, "status" | "priority" | "printerName" | "plannedMinutes" | "notes">>) {
    setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, ...patch } : item)));
    const response = await fetch(`/api/production?id=${encodeURIComponent(job.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setFeedback("Não foi possível atualizar o job. Verifique o login e tente novamente.");
      reload();
      return;
    }
    setFeedback(`${job.order.orderNumber} atualizado.`);
  }

  function move(job: Job, direction: 1 | -1) {
    const index = columns.findIndex((column) => column.id === job.status);
    const target = columns[(index < 0 ? 0 : index) + direction];
    if (!target) return;
    void update(job, { status: target.id });
  }

  const visible = useMemo(() => (showCompleted ? jobs : jobs.filter((job) => job.status !== "COMPLETED")), [jobs, showCompleted]);
  const grouped = useMemo(
    () => columns.map((column) => ({ ...column, jobs: visible.filter((job) => job.status === column.id) })),
    [visible],
  );
  const open = jobs.filter((job) => job.status !== "COMPLETED");
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
            <p>Da fila até a conclusão — recebimentos financeiros ficam em Vendas.</p>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <section className="production-stats">
          <div><span>Jobs abertos</span><strong>{open.length}</strong></div>
          <div><span>Tempo planejado</span><strong>{hours(plannedMinutes)}</strong></div>
          <div><span>Prioridade alta</span><strong>{urgent}</strong></div>
          <div><span>Prazo vencido</span><strong>{late}</strong></div>
        </section>

        <div className="project-tools" style={{ marginBottom: 16 }}>
          <button className={showCompleted ? "selected" : ""} onClick={() => setShowCompleted(!showCompleted)} type="button">
            {showCompleted ? "Ocultar concluídos" : "Mostrar concluídos"}
          </button>
          <a className="new-quote-button" href="/sales">＋ Novo pedido</a>
        </div>

        <div className="production-board">
              {grouped.map((column) => (
                <section className="board-column" key={column.id}>
                  <header className="board-column-head">
                    <div>
                      <strong>{column.label}</strong>
                      <small>{column.hint}</small>
                    </div>
                    <span className="material-badge">{column.jobs.length}</span>
                  </header>

                  {column.jobs.map((job) => {
                    const dueDate = job.order.dueDate ? new Date(job.order.dueDate) : null;
                    const isLate = Boolean(dueDate && dueDate < new Date() && job.status !== "COMPLETED");
                    return (
                      <article className={`job-card priority-${job.priority.toLowerCase()}`} key={job.id}>
                        <div className="card-top">
                          <span className="job-card-badges">
                            <span className="material-badge">{job.order.orderNumber}</span>
                            {job.order.quote?.id ? (
                              <a className="job-quote-link" href={`/quotes/${job.order.quote.id}/print`} target="_blank" rel="noreferrer" title="Abrir o orçamento original">
                                {job.order.quote.code ?? "Orçamento"}
                              </a>
                            ) : null}
                          </span>
                          <span className="project-status">{priorityLabel(job.priority)}</span>
                        </div>

                        <h2>{job.order.productName}</h2>
                        <p className="card-detail">
                          {job.order.customer?.name || "Cliente não informado"} · {job.order.quantity} un · {brl(job.order.totalAmount)}
                        </p>
                        <p className={isLate ? "job-due late" : "job-due"}>
                          {dueDate ? `Prazo: ${dueDate.toLocaleDateString("pt-BR")}` : "Sem prazo definido"}
                          {isLate ? " · atrasado" : ""}
                          {job.order.paymentStatus === "PAID" ? " · pago" : " · pagamento pendente"}
                        </p>

                        <div className="job-fields">
                          <label>
                            Impressora
                            <select value={job.printerName} onChange={(event) => void update(job, { printerName: event.target.value })}>
                              <option value="">Não atribuída</option>
                              {printers.map((printer) => <option key={printer.id} value={printer.model}>{printer.model}</option>)}
                              {job.printerName && !printers.some((printer) => printer.model === job.printerName) ? (
                                <option value={job.printerName}>{job.printerName}</option>
                              ) : null}
                            </select>
                          </label>
                          <label>
                            Prioridade
                            <select value={job.priority} onChange={(event) => void update(job, { priority: event.target.value })}>
                              {priorities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                          </label>
                          <label>
                            Tempo (min)
                            <input
                              inputMode="numeric"
                              defaultValue={job.plannedMinutes}
                              onBlur={(event) => {
                                const minutes = Math.max(0, Math.round(Number(event.target.value.replace(",", ".")) || 0));
                                if (minutes !== job.plannedMinutes) void update(job, { plannedMinutes: minutes });
                              }}
                            />
                          </label>
                        </div>

                        <label className="job-notes">
                          Observações
                          <textarea
                            defaultValue={job.notes}
                            placeholder="Cor, acabamento, cuidados de embalagem..."
                            onBlur={(event) => { if (event.target.value !== job.notes) void update(job, { notes: event.target.value }); }}
                          />
                        </label>

                        <div className="job-actions">
                          <button className="secondary-button" type="button" disabled={job.status === columns[0].id} onClick={() => move(job, -1)}>← Voltar</button>
                          <button className="primary-button" type="button" disabled={job.status === columns[columns.length - 1].id} onClick={() => move(job, 1)}>Avançar →</button>
                        </div>
                        {job.completedAt ? <p className="card-detail">Concluído em {new Date(job.completedAt).toLocaleDateString("pt-BR")}</p> : null}
                      </article>
                    );
                  })}

                  {column.jobs.length === 0 ? <div className="empty-note">Nada nesta etapa.</div> : null}
                </section>
              ))}
            </div>

        {jobs.length === 0 && !needsLogin ? (
          <div className="empty-note">Nenhum job de produção ainda. Crie um pedido em Vendas para abrir a fila.</div>
        ) : null}
      </div>
    </main>
  );
}
