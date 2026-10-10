"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { brl } from "@/lib/money";

type FixedCostMonth = {
  id: string;
  month: string;
  rent: number;
  software: number;
  accounting: number;
  internet: number;
  maintenance: number;
  marketing: number;
  energy: number;
  subscriptions: number;
  other: number;
  total: number;
};

type PricingSettings = {
  energyRate: number;
  defaultPowerWatts: number;
  laborRate: number;
  monthlyRent: number;
  monthlySubscriptions: number;
  monthlyMaintenance: number;
  monthlyOtherCosts: number;
  monthlyPieces: number;
  monthlyProductiveHours?: number;
  defaultMarkup: number;
  defaultLossRate: number;
  companyName?: string;
  companyContact?: string;
  quoteValidityDays?: number;
  quoteDeliveryText?: string;
  quoteWarrantyText?: string;
  quotePaymentText?: string;
};

type VariableCostEntry = {
  id: string;
  date: string;
  description: string;
  filament: number;
  supplies: number;
  commission: number;
  energy: number;
  shipping: number;
  packaging: number;
  waste: number;
  salesFee: number;
  maintenance: number;
  total: number;
};

const n = (value: string) => Number(value.replace(",", ".")) || 0;
// Data local, não UTC — perto da meia-noite no Brasil (~21h em UTC-3)
// toISOString() já mostraria o dia/mês seguinte.
const pad = (value: number) => String(value).padStart(2, "0");
const todayLocal = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
const currentMonth = () => todayLocal().slice(0, 7);
/** "2026-10" → "Out/2026" */
const monthName = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${year}`;
};

const fixedFields: { key: keyof typeof emptyFixed; label: string }[] = [
  { key: "rent", label: "Aluguel" },
  { key: "software", label: "Prestação Impressora 3D" },
  { key: "accounting", label: "Contabilidade" },
  { key: "internet", label: "Internet" },
  { key: "maintenance", label: "Manutenção" },
  { key: "marketing", label: "Marketing" },
  { key: "energy", label: "Energia (parte fixa)" },
  { key: "subscriptions", label: "Assinaturas" },
  { key: "other", label: "Outras" },
];
const emptyFixed = { month: currentMonth(), rent: "0", software: "0", accounting: "0", internet: "0", maintenance: "0", marketing: "0", energy: "0", subscriptions: "0", other: "0" };
const fixedMonthToDraft = (item: FixedCostMonth) => ({
  month: item.month,
  rent: String(item.rent), software: String(item.software), accounting: String(item.accounting),
  internet: String(item.internet), maintenance: String(item.maintenance), marketing: String(item.marketing),
  energy: String(item.energy), subscriptions: String(item.subscriptions), other: String(item.other),
});
// Sem lançamento do mês pedido ainda: repete os valores do mês anterior mais
// recente, pra não começar o mês do zero — o cálculo de preço (effectiveMonthlyFixedCost
// em costing.ts) já assume esse mesmo comportamento.
const mostRecentPastMonth = (months: FixedCostMonth[], month: string) =>
  months.filter((item) => item.month < month).sort((a, b) => (a.month < b.month ? 1 : -1))[0];

const variableFields: { key: keyof typeof emptyVariable; label: string }[] = [
  { key: "filament", label: "Filamento" },
  { key: "supplies", label: "Insumos (LED, argolas, ímãs…)" },
  { key: "commission", label: "Comissão" },
  { key: "energy", label: "Energia de impressão" },
  { key: "shipping", label: "Frete" },
  { key: "packaging", label: "Embalagem" },
  { key: "waste", label: "Perdas / Refugo" },
  { key: "salesFee", label: "Taxas de venda" },
  { key: "maintenance", label: "Manutenção por peça" },
];
const emptyVariable = { date: todayLocal(), description: "", filament: "0", supplies: "0", commission: "0", energy: "0", shipping: "0", packaging: "0", waste: "0", salesFee: "0", maintenance: "0" };

// Campos que entram direto no cálculo de energia/mão de obra/rateio fixo em
// calculatePieceCost + fixedCostPerPiece (src/lib/costing.ts) — vieram do
// grupo "Produção" de Configurações, que não tem mais essa edição.
// Potência não fica aqui: cada impressora já tem a própria potência (W)
// cadastrada na Biblioteca, e é ela que entra no cálculo — defaultPowerWatts
// nunca é usado no Catálogo Novo, só como valor inicial esquecido na Calculadora.
// O custo fixo do mês é rateado por hora de impressão (fixo ÷ horas produtivas):
// cada peça paga pelo tempo que ocupa a impressora, não um valor igual para todas.
const productionFields: { key: "energyRate" | "laborRate" | "monthlyProductiveHours"; label: string }[] = [
  { key: "energyRate", label: "Custo do kWh (R$)" },
  { key: "laborRate", label: "Custo da hora de trabalho (R$)" },
  { key: "monthlyProductiveHours", label: "Horas produtivas de impressão por mês" },
];

const emptySettings: PricingSettings = { energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60, defaultMarkup: 40, defaultLossRate: 5 };
const settingsToProductionDraft = (item: PricingSettings) => ({ energyRate: String(item.energyRate), laborRate: String(item.laborRate), monthlyProductiveHours: String(item.monthlyProductiveHours ?? 350) });

export default function CostsPage() {
  const [tab, setTab] = useState<"fixed" | "variable" | "production">("fixed");
  const [fixedMonths, setFixedMonths] = useState<FixedCostMonth[]>([]);
  const [variableEntries, setVariableEntries] = useState<VariableCostEntry[]>([]);
  const [fixedDraft, setFixedDraft] = useState(emptyFixed);
  const [repeatedFromMonth, setRepeatedFromMonth] = useState<string | null>(null);
  // Só pra ler o mês selecionado no form dentro do load() sem colocar
  // fixedDraft nas deps do efeito (isso reexecutaria o fetch a cada tecla).
  const fixedDraftMonthRef = useRef(fixedDraft.month);
  useEffect(() => { fixedDraftMonthRef.current = fixedDraft.month; }, [fixedDraft.month]);
  const [variableDraft, setVariableDraft] = useState(emptyVariable);
  const [settings, setSettings] = useState<PricingSettings>(emptySettings);
  const [productionDraft, setProductionDraft] = useState(settingsToProductionDraft(emptySettings));
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const [fixedRes, variableRes, settingsRes] = await Promise.all([fetch("/api/costs/fixed"), fetch("/api/costs/variable"), fetch("/api/settings")]);
      if (fixedRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (fixedRes.ok) {
        const months = (await fixedRes.json()) as FixedCostMonth[];
        setFixedMonths(months);
        const targetMonth = fixedDraftMonthRef.current;
        const existing = months.find((item) => item.month === targetMonth);
        if (existing) {
          setRepeatedFromMonth(null);
          setFixedDraft(fixedMonthToDraft(existing));
        } else {
          const past = mostRecentPastMonth(months, targetMonth);
          if (past) { setRepeatedFromMonth(past.month); setFixedDraft({ ...fixedMonthToDraft(past), month: targetMonth }); }
          else setRepeatedFromMonth(null);
        }
      }
      if (variableRes.ok) setVariableEntries((await variableRes.json()) as VariableCostEntry[]);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as PricingSettings;
        setSettings(data);
        setProductionDraft(settingsToProductionDraft(data));
      }
    }
    void load();
  }, [reloadToken]);

  const fixedTotal = useMemo(() => fixedFields.reduce((sum, field) => sum + n(fixedDraft[field.key]), 0), [fixedDraft]);
  // Coluna só para categoria usada em algum mês (as zeradas em todos somem da tabela).
  const fixedColumns = useMemo(() => fixedFields.filter((field) => fixedMonths.some((item) => item[field.key as keyof FixedCostMonth])) as { key: Exclude<keyof FixedCostMonth, "id" | "month">; label: string }[], [fixedMonths]);
  const variableByMonth = useMemo(() => {
    const groups = new Map<string, VariableCostEntry[]>();
    for (const item of [...variableEntries].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      const month = item.date.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), item]);
    }
    return [...groups].map(([month, items]) => ({ month, items, total: items.reduce((sum, item) => sum + item.total, 0) }));
  }, [variableEntries]);
  const variableTotal = useMemo(() => variableFields.reduce((sum, field) => sum + n(variableDraft[field.key]), 0), [variableDraft]);

  async function saveFixed(event: FormEvent) {
    event.preventDefault();
    const body = Object.fromEntries(fixedFields.map((field) => [field.key, n(fixedDraft[field.key])]));
    const response = await fetch("/api/costs/fixed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: fixedDraft.month, ...body }),
    });
    setFeedback(response.ok ? `Custos fixos de ${fixedDraft.month} salvos.` : "Não foi possível salvar.");
    if (response.ok) reload();
  }

  async function saveVariable(event: FormEvent) {
    event.preventDefault();
    if (!variableTotal) { setFeedback("Informe pelo menos um valor."); return; }
    const body = Object.fromEntries(variableFields.map((field) => [field.key, n(variableDraft[field.key])]));
    const response = await fetch("/api/costs/variable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: variableDraft.date, description: variableDraft.description, ...body }),
    });
    const result = await response.json().catch(() => ({}));
    setFeedback(response.ok ? "Custo variável lançado." : (typeof result.error === "string" ? result.error : "Não foi possível salvar."));
    if (response.ok) { setVariableDraft({ ...emptyVariable, date: variableDraft.date }); reload(); }
  }

  async function saveProduction(event: FormEvent) {
    event.preventDefault();
    const updated: PricingSettings = {
      ...settings,
      energyRate: n(productionDraft.energyRate),
      laborRate: n(productionDraft.laborRate),
      monthlyProductiveHours: Math.max(n(productionDraft.monthlyProductiveHours), 1),
    };
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    setFeedback(response.ok ? "Custos de produção salvos." : "Não foi possível salvar.");
    if (response.ok) setSettings(updated);
  }

  async function deleteFixed(id: string) {
    if (!window.confirm("Excluir este mês de custos fixos?")) return;
    await fetch(`/api/costs/fixed?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  }
  async function deleteVariable(id: string) {
    if (!window.confirm("Excluir este lançamento?")) return;
    const response = await fetch(`/api/costs/variable?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setFeedback(result.error ?? "Não foi possível excluir."); return; }
    reload();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="costs" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e lançar custos." /> : null}
        <section className="library-heading">
          <div>
            <h1>Custos</h1>
            <p>Custos fixos por mês e custos variáveis lançados por data — a base do fluxo de caixa.</p>
          </div>
          <div className="preset-tabs">
            <button className={tab === "fixed" ? "selected" : ""} onClick={() => setTab("fixed")}>◎ Fixos</button>
            <button className={tab === "variable" ? "selected" : ""} onClick={() => setTab("variable")}>◇ Variáveis</button>
            <button className={tab === "production" ? "selected" : ""} onClick={() => setTab("production")}>⚙ Produção</button>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        {tab === "fixed" ? (
          <div className="costs-stack">
            <form className="preset-form wide-form" onSubmit={saveFixed}>
              <h2>Custos fixos do mês</h2>
              <label>Mês<input type="month" value={fixedDraft.month} onChange={(event) => {
                const month = event.target.value;
                const existing = fixedMonths.find((item) => item.month === month);
                if (existing) { setRepeatedFromMonth(null); setFixedDraft(fixedMonthToDraft(existing)); return; }
                const past = mostRecentPastMonth(fixedMonths, month);
                if (past) { setRepeatedFromMonth(past.month); setFixedDraft({ ...fixedMonthToDraft(past), month }); }
                else { setRepeatedFromMonth(null); setFixedDraft({ ...emptyFixed, month }); }
              }} /></label>
              {repeatedFromMonth ? (
                <p className="admin-feedback">Nenhum lançamento para {fixedDraft.month} ainda — repetindo os valores de {repeatedFromMonth}. Confira e clique em Salvar para confirmar este mês.</p>
              ) : null}
              <div className="form-grid">
                {fixedFields.map((field) => (
                  <label key={field.key}>{field.label}
                    <input inputMode="decimal" value={fixedDraft[field.key]} onChange={(event) => setFixedDraft({ ...fixedDraft, [field.key]: event.target.value })} />
                  </label>
                ))}
              </div>
              <div className="catalog-preview"><span>Total do mês</span><strong>{brl(fixedTotal)}</strong></div>
              <button className="primary-button" type="submit">Salvar custos fixos</button>
            </form>

            {/* Mês a mês em tabela (antes um card por mês ocupava a tela toda).
                Só as categorias com valor em algum mês viram coluna. */}
            <section className="costs-table-panel">
              <h2>Custos fixos mês a mês</h2>
              {fixedMonths.length ? (
                <div className="scroll-table">
                  <table className="costs-table">
                    <thead>
                      <tr>
                        <th>Mês</th>
                        {/* Total logo depois do mês: no celular a tabela rola e o total segue à vista. */}
                        <th className="money">Total</th>
                        {fixedColumns.map((field) => <th key={field.key} className="money">{field.label}</th>)}
                        <th aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...fixedMonths].sort((a, b) => (a.month < b.month ? 1 : -1)).map((item) => (
                        <tr key={item.id} className={[item.month === currentMonth() ? "current" : "", item.month === fixedDraft.month ? "editing" : ""].filter(Boolean).join(" ") || undefined}>
                          <td className="month">
                            {monthName(item.month)}
                            {item.month === currentMonth() ? <em className="today-tag">atual</em> : item.month > currentMonth() ? <em className="today-tag">previsto</em> : null}
                          </td>
                          <td className="money total">{brl(item.total)}</td>
                          {fixedColumns.map((field) => <td key={field.key} className={item[field.key] ? "money" : "money zero"}>{item[field.key] ? brl(item[field.key]) : "—"}</td>)}
                          <td className="actions">
                            <button className="edit-button" onClick={() => { setRepeatedFromMonth(null); setFixedDraft(fixedMonthToDraft(item)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
                            <button className="delete-button" onClick={() => deleteFixed(item.id)} aria-label={`Excluir ${item.month}`}><IconTrash className="nav-icon" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-note">Nenhum mês lançado ainda.</p>}
            </section>
          </div>
        ) : tab === "variable" ? (
          <div className="costs-stack">
            <form className="preset-form wide-form" onSubmit={saveVariable}>
              <h2>Novo custo variável</h2>
              <p className="card-detail">Comprou filamento ou insumo? Use <a href="/admin">Biblioteca → Registrar compra</a> no próprio item: lança aqui, no Caixa e já atualiza o custo do item.</p>
              <div className="form-grid">
                <label>Data<input type="date" value={variableDraft.date} onChange={(event) => setVariableDraft({ ...variableDraft, date: event.target.value })} /></label>
                <label>Descrição<input value={variableDraft.description} onChange={(event) => setVariableDraft({ ...variableDraft, description: event.target.value })} placeholder="Ex: Compra de filamento PLA 1kg" /></label>
              </div>
              <div className="form-grid">
                {variableFields.map((field) => (
                  <label key={field.key}>{field.label}
                    <input inputMode="decimal" value={variableDraft[field.key]} onChange={(event) => setVariableDraft({ ...variableDraft, [field.key]: event.target.value })} />
                  </label>
                ))}
              </div>
              <div className="catalog-preview"><span>Total do lançamento</span><strong>{brl(variableTotal)}</strong></div>
              <button className="primary-button" type="submit">Lançar custo</button>
            </form>

            <section className="costs-table-panel">
              <h2>Custos variáveis mês a mês</h2>
              {variableByMonth.length ? (
                <div className="scroll-table">
                  <table className="costs-table">
                    <thead>
                      <tr><th>Data</th><th>Descrição</th><th>Composição</th><th className="money">Total</th><th aria-label="Ações" /></tr>
                    </thead>
                    {variableByMonth.map((group) => (
                      <tbody key={group.month}>
                        <tr className="group">
                          <td colSpan={3}>{monthName(group.month)} <small>{group.items.length} {group.items.length === 1 ? "lançamento" : "lançamentos"}</small></td>
                          <td className="money total">{brl(group.total)}</td>
                          <td />
                        </tr>
                        {group.items.map((item) => (
                          <tr key={item.id}>
                            <td className="date">{item.date.slice(0, 10).split("-").reverse().join("/")}</td>
                            <td>{item.description || "Custo variável"}</td>
                            <td className="parts">{variableFields.filter((field) => item[field.key as keyof VariableCostEntry]).map((field) => field.label.replace(/ \(.*\)/, "")).join(", ") || "—"}</td>
                            <td className="money">{brl(item.total)}</td>
                            <td className="actions"><button className="delete-button" onClick={() => deleteVariable(item.id)} aria-label="Excluir lançamento"><IconTrash className="nav-icon" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              ) : <p className="empty-note">Nenhum custo variável lançado ainda.</p>}
            </section>
          </div>
        ) : (
          <div className="costs-stack">
            <form className="preset-form wide-form" onSubmit={saveProduction}>
              <h2>Custos de produção da máquina</h2>
              <p className="settings-intro">Mesmos valores de Configurações → Produção — entram direto no custo de energia e mão de obra calculado para cada peça.</p>
              <div className="form-grid">
                {productionFields.map((field) => (
                  <label key={field.key}>{field.label}
                    <input inputMode="decimal" value={productionDraft[field.key]} onChange={(event) => setProductionDraft({ ...productionDraft, [field.key]: event.target.value })} />
                  </label>
                ))}
              </div>

              <button className="primary-button" type="submit">Salvar custos de produção</button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
