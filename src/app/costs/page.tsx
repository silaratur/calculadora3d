"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";

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
  commission: number;
  energy: number;
  shipping: number;
  packaging: number;
  waste: number;
  salesFee: number;
  maintenance: number;
  total: number;
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;
// Data local, não UTC — perto da meia-noite no Brasil (~21h em UTC-3)
// toISOString() já mostraria o dia/mês seguinte.
const pad = (value: number) => String(value).padStart(2, "0");
const todayLocal = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
const currentMonth = () => todayLocal().slice(0, 7);

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
  { key: "commission", label: "Comissão" },
  { key: "energy", label: "Energia de impressão" },
  { key: "shipping", label: "Frete" },
  { key: "packaging", label: "Embalagem" },
  { key: "waste", label: "Perdas / Refugo" },
  { key: "salesFee", label: "Taxas de venda" },
  { key: "maintenance", label: "Manutenção por peça" },
];
const emptyVariable = { date: todayLocal(), description: "", filament: "0", commission: "0", energy: "0", shipping: "0", packaging: "0", waste: "0", salesFee: "0", maintenance: "0" };

// Campos que entram direto no cálculo de energia/mão de obra/rateio fixo em
// calculatePieceCost + fixedCostPerPiece (src/lib/costing.ts) — vieram do
// grupo "Produção" de Configurações, que não tem mais essa edição.
// Potência não fica aqui: cada impressora já tem a própria potência (W)
// cadastrada na Biblioteca, e é ela que entra no cálculo — defaultPowerWatts
// nunca é usado no Catálogo Novo, só como valor inicial esquecido na Calculadora.
const productionFields: { key: "energyRate" | "laborRate" | "monthlyPieces"; label: string }[] = [
  { key: "energyRate", label: "Custo do kWh (R$)" },
  { key: "laborRate", label: "Custo da hora de trabalho (R$)" },
  { key: "monthlyPieces", label: "Peças produzidas por mês" },
];

const emptySettings: PricingSettings = { energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60, defaultMarkup: 40, defaultLossRate: 5 };
const settingsToProductionDraft = (item: PricingSettings) => ({ energyRate: String(item.energyRate), laborRate: String(item.laborRate), monthlyPieces: String(item.monthlyPieces) });

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
    setFeedback(response.ok ? "Custo variável lançado." : "Não foi possível salvar.");
    if (response.ok) { setVariableDraft({ ...emptyVariable, date: variableDraft.date }); reload(); }
  }

  async function saveProduction(event: FormEvent) {
    event.preventDefault();
    const updated: PricingSettings = {
      ...settings,
      energyRate: n(productionDraft.energyRate),
      laborRate: n(productionDraft.laborRate),
      monthlyPieces: Math.max(n(productionDraft.monthlyPieces), 1),
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
    await fetch(`/api/costs/variable?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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

            <div className="preset-grid">
              {fixedMonths.map((item) => (
                <article className="preset-card" key={item.id}>
                  <div className="card-top">
                    <span className="material-badge">{item.month}</span>
                    <span className="card-actions">
                      <button className="edit-button" onClick={() => setFixedDraft(fixedMonthToDraft(item))}>Editar</button>
                      <button className="delete-button" onClick={() => deleteFixed(item.id)} aria-label={`Excluir ${item.month}`}><IconTrash className="nav-icon" /></button>
                    </span>
                  </div>
                  <h3>Total do mês</h3>
                  <strong>{brl(item.total)}</strong>
                  <p className="card-detail">Aluguel {brl(item.rent)} · Assinaturas {brl(item.subscriptions)} · Manutenção {brl(item.maintenance)}</p>
                </article>
              ))}
              {fixedMonths.length === 0 ? <div className="empty-note">Nenhum mês lançado ainda.</div> : null}
            </div>
          </div>
        ) : tab === "variable" ? (
          <div className="costs-stack">
            <form className="preset-form wide-form" onSubmit={saveVariable}>
              <h2>Novo custo variável</h2>
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

            <div className="preset-grid">
              {variableEntries.map((item) => (
                <article className="preset-card" key={item.id}>
                  <div className="card-top">
                    <span className="material-badge">{new Date(item.date).toLocaleDateString("pt-BR")}</span>
                    <button className="delete-button" onClick={() => deleteVariable(item.id)} aria-label="Excluir lançamento"><IconTrash className="nav-icon" /></button>
                  </div>
                  <h3>{item.description || "Custo variável"}</h3>
                  <strong>{brl(item.total)}</strong>
                </article>
              ))}
              {variableEntries.length === 0 ? <div className="empty-note">Nenhum custo variável lançado ainda.</div> : null}
            </div>
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
