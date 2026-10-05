"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { brl } from "@/lib/money";

type PartnerRow = { name: string; share: number; withdrawals: number; contributions: number };
type Entry = { date: string; kind: string; type: string; category: string; description: string; amount: number; partner: string };
type Summary = {
  month: string; label: string; opening: number; closing: number;
  revenue: number; receipts: number; reversals: number; receiptsCount: number;
  otherIn: number; contributions: number; fixed: number; variable: number; otherOut: number; operatingCosts: number;
  investments: number; withdrawals: number; result: number; productCost: number; grossMarginOnReceived: number;
  ordersCount: number; ordersTotal: number; ordersOpen: number; plannedOut: number;
  partners: PartnerRow[]; entries: Entry[];
};
type MonthRow = Omit<Summary, "partners" | "entries"> & { closed: boolean; withdrawalsByPartner: PartnerRow[] };
type Account = { name: string; share: number; resultShare: number; contributed: number; withdrawn: number; balance: number; canWithdrawNow: number };
type Accounts = { accumulatedResult: number; availableCash: number; partners: Account[] };
type Closing = { closedAt: string; closedBy: string; notes: string; snapshot: { summary: Summary; accounts: Accounts } };
type FinanceData = { current: string; partners: { name: string; share: number }[]; cashReserve: number; months: MonthRow[]; selected: Summary; accounts: Accounts; closing: Closing | null };

const kindLabel: Record<string, string> = {
  receipt: "Recebimento", reversal: "Estorno", contribution: "Aporte", otherIn: "Outra entrada", withdrawal: "Retirada",
  investment: "Investimento", fixed: "Custo fixo", variable: "Custo variável", otherOut: "Outra saída",
};
const neg = (value: number) => (value < 0 ? "negative" : undefined);
const todayLocal = () => { const now = new Date(); const pad = (v: number) => String(v).padStart(2, "0"); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
/** Data sugerida para lançar no mês escolhido: hoje se for o mês atual, senão o último dia dele. */
function defaultDate(month: string, current: string) {
  if (month === current) return todayLocal();
  const [year, mon] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;
}
/** Campos que mudam a foto do mês — se algum diferir do que foi congelado, avisa. */
const watched: (keyof Summary)[] = ["revenue", "operatingCosts", "result", "withdrawals", "contributions", "investments", "closing"];

export default function FechamentoPage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [month, setMonth] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [move, setMove] = useState({ kind: "withdrawal" as "withdrawal" | "contribution", partner: "Ambos", amount: "", date: "", description: "" });
  const [confirmClose, setConfirmClose] = useState(false);
  const [notes, setNotes] = useState("");
  const [editPartners, setEditPartners] = useState<{ name: string; share: string }[] | null>(null);
  const [reserve, setReserve] = useState("");
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/finance${month ? `?month=${month}` : ""}`);
      if (response.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (!response.ok) return;
      const body = (await response.json()) as FinanceData;
      setData(body);
      setMove((current) => ({ ...current, date: defaultDate(body.selected.month, body.current) }));
    }
    void load();
  }, [month, reloadToken]);

  if (!data) {
    return (
      <main className="admin-shell">
        <AdminHeader active="fechamento" />
        <div className="admin-content">{needsLogin ? <AuthBanner message="Entre novamente para ver o fechamento." /> : <p className="empty-note">Carregando…</p>}</div>
      </main>
    );
  }

  const s = data.selected;
  const closing = data.closing;
  const isCurrent = s.month === data.current;
  const changed = closing ? watched.filter((key) => Math.abs((closing.snapshot.summary[key] as number) - (s[key] as number)) >= 0.01) : [];
  const partnerNames = data.partners.map((partner) => partner.name);

  async function registerMove(event: FormEvent) {
    event.preventDefault();
    const amount = Number(move.amount.replace(/\./g, "").replace(",", "."));
    if (!amount || amount <= 0) { setFeedback("Informe um valor válido."); return; }
    const isOut = move.kind === "withdrawal";
    const response = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: move.date, category: isOut ? "Retirada de sócio" : "Aporte de sócio", type: isOut ? "OUT" : "IN",
        description: move.description, status: "REALIZED", amount, partner: move.partner,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setFeedback(response.ok ? `${isOut ? "Retirada" : "Aporte"} de ${brl(amount)} registrado.` : (body.error ?? "Não foi possível registrar."));
    if (response.ok) { setMove({ ...move, amount: "", description: "" }); reload(); }
  }

  async function closeMonth() {
    const response = await fetch("/api/finance/closing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: s.month, notes }) });
    const body = await response.json().catch(() => ({}));
    setFeedback(response.ok ? `${s.label} fechado. A foto do mês está guardada.` : (body.error ?? "Não foi possível fechar."));
    setConfirmClose(false);
    if (response.ok) { setNotes(""); reload(); }
  }

  async function reopenMonth() {
    const response = await fetch(`/api/finance/closing?month=${s.month}`, { method: "DELETE" });
    setFeedback(response.ok ? `${s.label} reaberto — lançamentos liberados. Feche de novo quando terminar.` : "Não foi possível reabrir.");
    if (response.ok) reload();
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!editPartners) return;
    const response = await fetch("/api/finance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partners: editPartners.map((partner) => ({ name: partner.name, share: Number(partner.share.replace(",", ".")) })), cashReserve: Number(reserve.replace(/\./g, "").replace(",", ".")) || 0 }),
    });
    const body = await response.json().catch(() => ({}));
    setFeedback(response.ok ? "Sócios e reserva salvos." : (body.error ?? "Não foi possível salvar."));
    if (response.ok) { setEditPartners(null); reload(); }
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="fechamento" />
      <div className="admin-content finance-page">
        {needsLogin ? <AuthBanner message="Entre novamente para ver o fechamento." /> : null}
        <section className="library-heading">
          <div>
            <h1>Fechamento do mês</h1>
            <p>A foto de cada mês pelo que entrou e saiu do caixa: faturamento recebido, custos, resultado, retiradas dos sócios e o que fica em caixa.</p>
          </div>
          <Link className="secondary-button" href="/cashflow">Ver extrato do Caixa</Link>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        {/* Meses lado a lado — clique para abrir o detalhe. */}
        <div className="scroll-table finance-months">
          <table className="cash-table">
            <thead>
              <tr><th>Mês</th><th>Faturamento (recebido)</th><th>Custos</th><th>Resultado</th><th>Retiradas</th><th>Saldo no fim</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {[...data.months].reverse().map((row) => (
                <tr key={row.month} className={row.month === s.month ? "finance-row-active" : undefined} onClick={() => setMonth(row.month)}>
                  <td><button type="button" className="finance-month-link" onClick={() => setMonth(row.month)}>{row.label}</button></td>
                  <td className="cash-in">{brl(row.revenue)}</td>
                  <td className="cash-out">{brl(row.operatingCosts)}</td>
                  <td className={neg(row.result)}>{brl(row.result)}</td>
                  <td>{brl(row.withdrawals)}</td>
                  <td className={neg(row.closing)}><strong>{brl(row.closing)}</strong></td>
                  <td>{row.closed ? <span className="finance-badge closed">Fechado</span> : row.month === data.current ? <span className="finance-badge">Em andamento</span> : <span className="finance-badge open">Aberto</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="finance-head">
          <div>
            <h2>{s.label}</h2>
            {closing ? (
              <p className="finance-status closed">Fechado em {new Date(closing.closedAt).toLocaleDateString("pt-BR")} por {closing.closedBy || "—"}{closing.notes ? ` · “${closing.notes}”` : ""}</p>
            ) : (
              <p className="finance-status">{isCurrent ? "Mês em andamento — os números ainda mudam." : "Mês aberto — confira e feche para guardar a foto."}</p>
            )}
          </div>
          <div className="finance-actions">
            {closing ? <button type="button" className="secondary-button" onClick={() => void reopenMonth()}>Reabrir mês</button> : null}
            {!closing && !isCurrent && !confirmClose ? <button type="button" className="primary-button" onClick={() => setConfirmClose(true)}>Fechar mês</button> : null}
          </div>
        </section>

        {confirmClose ? (
          <div className="finance-confirm">
            <p>Fechar <strong>{s.label}</strong> congela estes números e bloqueia lançamentos com data neste mês (dá para reabrir depois).</p>
            <label>Observação (opcional)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: primeiro mês de faturamento" /></label>
            <div className="finance-actions">
              <button type="button" className="primary-button" onClick={() => void closeMonth()}>Confirmar fechamento</button>
              <button type="button" className="secondary-button" onClick={() => setConfirmClose(false)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {changed.length ? (
          <p className="finance-warning">Os números de hoje diferem da foto guardada no fechamento (algo foi lançado ou alterado depois). Reabra e feche de novo para atualizar a foto.</p>
        ) : null}

        <section className="production-stats finance-stats">
          <div><span>Faturamento recebido</span><strong className="cash-in">{brl(s.revenue)}</strong><small>{s.receiptsCount} recebimento{s.receiptsCount === 1 ? "" : "s"}{s.reversals ? ` · estornos ${brl(s.reversals)}` : ""}</small></div>
          <div><span>Custos do mês</span><strong className="cash-out">{brl(s.operatingCosts)}</strong><small>fixos {brl(s.fixed)} · variáveis {brl(s.variable)}{s.otherOut ? ` · outros ${brl(s.otherOut)}` : ""}</small></div>
          <div><span>Resultado</span><strong className={neg(s.result)}>{brl(s.result)}</strong><small>faturamento − custos</small></div>
          <div><span>Retiradas</span><strong>{brl(s.withdrawals)}</strong><small>{s.partners.map((partner) => `${partner.name} ${brl(partner.withdrawals)}`).join(" · ")}</small></div>
        </section>

        <div className="finance-grid">
          <section className="finance-card">
            <h3>Caixa do mês</h3>
            <dl className="finance-lines">
              <div><dt>Saldo no início</dt><dd>{brl(s.opening)}</dd></div>
              <div><dt>+ Faturamento recebido</dt><dd className="cash-in">{brl(s.revenue)}</dd></div>
              {s.otherIn ? <div><dt>+ Outras entradas</dt><dd className="cash-in">{brl(s.otherIn)}</dd></div> : null}
              {s.contributions ? <div><dt>+ Aportes dos sócios</dt><dd className="cash-in">{brl(s.contributions)}</dd></div> : null}
              <div><dt>− Custos fixos</dt><dd className="cash-out">{brl(s.fixed)}</dd></div>
              <div><dt>− Custos variáveis</dt><dd className="cash-out">{brl(s.variable)}</dd></div>
              {s.otherOut ? <div><dt>− Outras saídas</dt><dd className="cash-out">{brl(s.otherOut)}</dd></div> : null}
              {s.investments ? <div><dt>− Investimentos</dt><dd className="cash-out">{brl(s.investments)}</dd></div> : null}
              <div><dt>− Retiradas dos sócios</dt><dd className="cash-out">{brl(s.withdrawals)}</dd></div>
              <div className="finance-total"><dt>Saldo no fim</dt><dd className={neg(s.closing)}>{brl(s.closing)}</dd></div>
            </dl>
            {s.plannedOut ? <p className="finance-note">Previsto ainda neste mês: {brl(s.plannedOut)} de saídas (não descontado).</p> : null}
          </section>

          <section className="finance-card">
            <h3>Vendas e margem</h3>
            <dl className="finance-lines">
              <div><dt>Pedidos feitos no mês</dt><dd>{s.ordersCount} · {brl(s.ordersTotal)}</dd></div>
              <div><dt>Desses, ainda a receber</dt><dd>{brl(s.ordersOpen)}</dd></div>
              <div><dt>Custo de produção do que foi recebido</dt><dd className="cash-out">{brl(s.productCost)}</dd></div>
              <div className="finance-total"><dt>Margem sobre o recebido</dt><dd className={neg(s.grossMarginOnReceived)}>{brl(s.grossMarginOnReceived)}</dd></div>
            </dl>
            <p className="finance-note">O custo de produção (material e máquina das peças recebidas) serve para ver a margem; ele não sai do caixa aqui — o material entra como custo quando é comprado.</p>
          </section>
        </div>

        <section className="finance-card">
          <div className="finance-card-head">
            <h3>Sócios — até o fim de {s.label.toLowerCase()}</h3>
            <button type="button" className="secondary-button" onClick={() => { setEditPartners(data.partners.map((partner) => ({ name: partner.name, share: String(partner.share) }))); setReserve(String(data.cashReserve).replace(".", ",")); }}>Ajustar sócios e reserva</button>
          </div>
          <div className="scroll-table">
            <table className="cash-table">
              <thead>
                <tr><th>Sócio</th><th>Participação</th><th>Parte do resultado</th><th>Aportes</th><th>Retirado</th><th>Saldo a retirar</th><th>Pode retirar agora</th></tr>
              </thead>
              <tbody>
                {data.accounts.partners.map((partner) => (
                  <tr key={partner.name}>
                    <td><strong>{partner.name}</strong></td>
                    <td>{partner.share}%</td>
                    <td className={neg(partner.resultShare)}>{brl(partner.resultShare)}</td>
                    <td>{brl(partner.contributed)}</td>
                    <td>{brl(partner.withdrawn)}</td>
                    <td className={neg(partner.balance)}><strong>{brl(partner.balance)}</strong></td>
                    <td className="cash-in"><strong>{brl(partner.canWithdrawNow)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="finance-note">
            Resultado acumulado desde o início: <strong className={neg(data.accounts.accumulatedResult)}>{brl(data.accounts.accumulatedResult)}</strong>. Caixa disponível para retirada: <strong>{brl(data.accounts.availableCash)}</strong>
            {data.cashReserve ? ` (saldo menos a reserva de ${brl(data.cashReserve)})` : " (sem reserva mínima definida)"}. Saldo negativo = o sócio já retirou mais do que a parte dele no resultado.
          </p>

          {editPartners ? (
            <form className="finance-settings" onSubmit={saveSettings}>
              {editPartners.map((partner, index) => (
                <div className="form-grid" key={index}>
                  <label>Nome do sócio {index + 1}<input value={partner.name} onChange={(event) => setEditPartners(editPartners.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} /></label>
                  <label>Participação (%)<input inputMode="decimal" value={partner.share} onChange={(event) => setEditPartners(editPartners.map((item, i) => (i === index ? { ...item, share: event.target.value } : item)))} /></label>
                </div>
              ))}
              <label>Reserva mínima no caixa (R$)<input inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} placeholder="0,00" /></label>
              <div className="finance-actions">
                <button className="primary-button" type="submit">Salvar</button>
                <button className="secondary-button" type="button" onClick={() => setEditPartners(null)}>Cancelar</button>
              </div>
            </form>
          ) : null}
        </section>

        {!closing ? (
          <form className="preset-form wide-form finance-move" onSubmit={registerMove}>
            <h2>Registrar retirada ou aporte</h2>
            <div className="form-grid">
              <label>O quê<select value={move.kind} onChange={(event) => setMove({ ...move, kind: event.target.value as "withdrawal" | "contribution" })}><option value="withdrawal">Retirada (sai do caixa)</option><option value="contribution">Aporte (entra no caixa)</option></select></label>
              <label>Sócio<select value={move.partner} onChange={(event) => setMove({ ...move, partner: event.target.value })}>{[...partnerNames, "Ambos"].map((name) => <option key={name} value={name}>{name === "Ambos" ? "Ambos (divide pela participação)" : name}</option>)}</select></label>
              <label>Data<input type="date" value={move.date} onChange={(event) => setMove({ ...move, date: event.target.value })} /></label>
            </div>
            <div className="form-grid">
              <label>Valor (R$)<input inputMode="decimal" value={move.amount} onChange={(event) => setMove({ ...move, amount: event.target.value })} placeholder="0,00" /></label>
              <label>Observação<input value={move.description} onChange={(event) => setMove({ ...move, description: event.target.value })} placeholder="Ex: Pix de pró-labore" /></label>
            </div>
            {move.kind === "withdrawal" && move.partner !== "Ambos" ? (
              <p className="finance-note">{move.partner} pode retirar agora até {brl(data.accounts.partners.find((partner) => partner.name === move.partner)?.canWithdrawNow ?? 0)}.</p>
            ) : null}
            <button className="primary-button" type="submit">Registrar</button>
          </form>
        ) : null}

        <section className="finance-card">
          <h3>Movimentos do mês</h3>
          <div className="scroll-table">
            <table className="cash-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead>
              <tbody>
                {s.entries.map((entry, index) => (
                  <tr key={index}>
                    <td>{new Date(entry.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>{kindLabel[entry.kind] ?? entry.kind}{entry.partner ? ` · ${entry.partner}` : ""}</td>
                    <td>{entry.category}</td>
                    <td>{entry.description || "—"}</td>
                    <td className={entry.type === "IN" ? "cash-in" : "cash-out"}>{entry.type === "IN" ? "+" : "−"}{brl(entry.amount)}</td>
                  </tr>
                ))}
                {s.entries.length === 0 ? <tr><td colSpan={5} className="empty-note">Nenhum movimento neste mês.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
