"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";

type CashEntry = {
  id: string;
  date: string;
  category: string;
  type: "IN" | "OUT";
  description: string;
  status: "REALIZED" | "PLANNED";
  amount: number;
  sourceType: string | null;
};

type Summary = { totalIn: number; totalOut: number; balance: number; receivable: number; projectedBalance: number };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Data local, não UTC — perto da meia-noite no Brasil toISOString() já mostraria o dia seguinte.
const todayLocal = () => { const now = new Date(); const pad = (v: number) => String(v).padStart(2, "0"); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
const emptyEntry = { date: todayLocal(), category: "Venda", type: "IN" as "IN" | "OUT", description: "", status: "REALIZED" as "REALIZED" | "PLANNED", amount: "" };
const categories = ["Venda", "Custo Fixo", "Custo Variável", "Investimento", "Outro"];
const sourceLabel: Record<string, string> = { PAYMENT: "Recebimento", FIXED_COST: "Custo Fixo", VARIABLE_COST: "Custo Variável" };

export default function CashflowPage() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIn: 0, totalOut: 0, balance: 0, receivable: 0, projectedBalance: 0 });
  const [draft, setDraft] = useState(emptyEntry);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/cashflow");
      if (response.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (!response.ok) return;
      const body = (await response.json()) as { entries: CashEntry[]; summary: Summary };
      setEntries(body.entries);
      setSummary(body.summary);
    }
    void load();
  }, [reloadToken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(draft.amount.replace(",", "."));
    if (!amount || amount <= 0) { setFeedback("Informe um valor válido."); return; }
    const response = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, amount }),
    });
    setFeedback(response.ok ? "Lançamento registrado." : "Não foi possível registrar.");
    if (response.ok) { setDraft({ ...emptyEntry, date: draft.date }); reload(); }
  }

  async function remove(entry: CashEntry) {
    if (entry.sourceType) { setFeedback("Esse lançamento vem de outra tela — edite ou apague na origem (Vendas ou Custos)."); return; }
    if (!window.confirm("Excluir este lançamento?")) return;
    await fetch(`/api/cashflow?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    reload();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="cashflow" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver o fluxo de caixa." /> : null}
        <section className="library-heading">
          <div>
            <h1>Fluxo de Caixa</h1>
            <p>Entradas, saídas e a projeção considerando o que ainda falta receber.</p>
          </div>
        </section>

        <section className="production-stats cashflow-stats">
          <div><span>Total Entradas</span><strong className="cash-in">{brl(summary.totalIn)}</strong></div>
          <div><span>Total Saídas</span><strong className="cash-out">{brl(summary.totalOut)}</strong></div>
          <div><span>Saldo Caixa Real</span><strong>{brl(summary.balance)}</strong></div>
          <div><span>Contas a Receber</span><strong>{brl(summary.receivable)}</strong></div>
          <div><span>Projeção de Caixa</span><strong>{brl(summary.projectedBalance)}</strong></div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <div className="costs-stack">
          <form className="preset-form wide-form" onSubmit={submit}>
            <h2>Novo lançamento manual</h2>
            <div className="form-grid">
              <label>Data<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label>Categoria<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as "IN" | "OUT" })}><option value="IN">Entrada</option><option value="OUT">Saída</option></select></label>
            </div>
            <div className="form-grid">
              <label>Descrição<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Ex: Aporte de sócio" /></label>
              <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as "REALIZED" | "PLANNED" })}><option value="REALIZED">Realizado</option><option value="PLANNED">Previsto</option></select></label>
              <label>Valor (R$)<input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00" /></label>
            </div>
            <button className="primary-button" type="submit">Registrar</button>
          </form>

          <div className="scroll-table">
            <table className="cash-table">
              <thead>
                <tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Origem</th><th>Status</th><th>Valor</th><th></th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.date).toLocaleDateString("pt-BR")}</td>
                    <td>{entry.category}</td>
                    <td>{entry.description || "—"}</td>
                    <td>{entry.sourceType ? sourceLabel[entry.sourceType] ?? entry.sourceType : "Manual"}</td>
                    <td>{entry.status === "REALIZED" ? "Realizado" : "Previsto"}</td>
                    <td className={entry.type === "IN" ? "cash-in" : "cash-out"}>{entry.type === "IN" ? "+" : "-"}{brl(entry.amount)}</td>
                    <td>{!entry.sourceType ? <button className="delete-button" onClick={() => void remove(entry)} aria-label="Excluir lançamento"><IconTrash className="nav-icon" /></button> : null}</td>
                  </tr>
                ))}
                {entries.length === 0 ? <tr><td colSpan={7} className="empty-note">Nenhum lançamento ainda.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
