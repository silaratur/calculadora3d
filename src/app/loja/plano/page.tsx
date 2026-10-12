"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { brl } from "@/lib/money";

type State = "sugerida" | "agendada" | "no ar" | "pausada" | "encerrada" | "expirada";
type Margin = { sku: string; name: string; price: number; promoPrice: number; inStore: boolean; margin: number; marginPromo: number; marginWorst: number };
type Campaign = {
  id: string; title: string; objective: string; mechanic: string; startsAt: string; endsAt: string; status: string; state: State;
  promoPercent: number; promoLabel: string;
  recipe: { skus: string[]; coupon: { code: string; kind: "PERCENT" | "FIXED"; value: number; minOrder: number; maxUses?: number } | null; collection: { title: string; skus: string[] } | null; banner: { title: string } | null };
  margins: Margin[];
};

const STATE_LABEL: Record<State, string> = { sugerida: "Sugerida", agendada: "Agendada", "no ar": "No ar", pausada: "Pausada", encerrada: "Encerrada", expirada: "Passou a data" };
const STATE_PLURAL: Record<State, string> = { sugerida: "sugeridas", agendada: "agendadas", "no ar": "no ar", pausada: "pausadas", encerrada: "encerradas", expirada: "com a data vencida" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const DAY = 86_400_000;
// Margem mínima saudável com desconto (a meta sem desconto é 30%).
const marginLevel = (value: number) => (value < 15 ? "bad" : value < 22 ? "warn" : "ok");

export default function PlanoCampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/loja/plano");
      if (cancelled) return;
      if (response.status === 401 || response.status === 403) { setNeedsLogin(true); return; }
      if (response.ok) setCampaigns((await response.json()) as Campaign[]);
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadToken]);

  async function act(campaign: Campaign, action: "ativar" | "pausar") {
    if (action === "pausar" && !window.confirm(`Pausar "${campaign.title}"? A promoção, o cupom, a coleção e o banner saem da loja na hora.`)) return;
    setBusy(campaign.id);
    setFeedback("");
    const response = await fetch("/api/loja/plano", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: campaign.id, action }) });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível concluir."); return; }
    setFeedback(action === "ativar" ? `"${campaign.title}" ativada — entra na loja em ${fmt(campaign.startsAt)} e sai sozinha em ${fmt(campaign.endsAt)}.` : `"${campaign.title}" pausada.`);
    setReloadToken((token) => token + 1);
  }

  // Cronograma: do começo do mês atual até o fim do ano.
  const first = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const last = new Date(new Date(now).getFullYear(), 11, 31, 23, 59).getTime();
  const span = last - first;
  const pos = (time: number) => `${Math.max(0, Math.min(100, ((time - first) / span) * 100))}%`;
  const months = Array.from({ length: 12 - new Date(now).getMonth() }, (_, i) => new Date(new Date(now).getFullYear(), new Date(now).getMonth() + i, 1));
  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => ({ ...acc, [campaign.state]: (acc[campaign.state] ?? 0) + 1 }), {});

  return (
    <main className="admin-shell">
      <AdminHeader active="loja-plano" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre como administrador para ver o plano de campanhas." /> : null}
        <section className="library-heading">
          <div>
            <h1>Plano de campanhas</h1>
            <p>Campanhas sugeridas até o fim do ano. Ative as que quiser: cada uma liga sozinha a promoção, o cupom, a coleção e o banner no período, e sai da loja no fim. Pause a qualquer momento.</p>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <p className="plan-summary">
          {campaigns.length} campanhas · {(["sugerida", "agendada", "no ar", "pausada", "encerrada"] as State[]).filter((state) => counts[state]).map((state) => `${counts[state]} ${counts[state] === 1 ? STATE_LABEL[state].toLowerCase() : STATE_PLURAL[state]}`).join(" · ")}
        </p>

        {campaigns.length ? (
          <section className="plan-gantt" aria-label="Cronograma das campanhas">
            <div className="plan-gantt-months">
              <span className="plan-gantt-gutter" />
              <span className="plan-gantt-track">
                {months.map((month) => <span key={month.getTime()} className="plan-gantt-month" style={{ left: pos(month.getTime()) }}>{month.toLocaleDateString("pt-BR", { month: "long" })}</span>)}
              </span>
            </div>
            <div className="plan-gantt-rows">
              {campaigns.map((campaign) => {
                const s = new Date(campaign.startsAt).getTime();
                const e = new Date(campaign.endsAt).getTime();
                return (
                  <button key={campaign.id} type="button" className={`plan-gantt-row state-${campaign.state.replace(" ", "-")}`} onClick={() => { setOpen(campaign.id); document.getElementById(`camp-${campaign.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                    <span className="plan-gantt-name">{campaign.title}</span>
                    <span className="plan-gantt-track">
                      <i className="plan-gantt-today" style={{ left: pos(now) }} />
                      <span className="plan-gantt-bar" style={{ left: pos(s), width: `max(${((Math.max(e, s + DAY) - s) / span) * 100}%, 10px)` }} title={`${fmt(campaign.startsAt)} a ${fmt(campaign.endsAt)}`}><span>{fmt(campaign.startsAt)}–{fmt(campaign.endsAt)}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="plan-gantt-legend"><span className="state-sugerida">sugerida</span><span className="state-agendada">agendada</span><span className="state-no-ar">no ar</span><span className="state-pausada">pausada</span></p>
          </section>
        ) : null}

        <div className="plan-list">
          {campaigns.map((campaign) => {
            const worst = campaign.margins.length ? Math.min(...campaign.margins.map((item) => item.marginWorst)) : null;
            const canActivate = campaign.state === "sugerida" || campaign.state === "pausada";
            const canPause = campaign.status === "ACTIVE" && campaign.state !== "encerrada";
            const { coupon, collection, banner } = campaign.recipe;
            return (
              <article key={campaign.id} id={`camp-${campaign.id}`} className={`plan-card state-${campaign.state.replace(" ", "-")}`}>
                <header>
                  <div>
                    <h2>{campaign.title}</h2>
                    <p className="plan-dates">{fmt(campaign.startsAt)} a {fmt(campaign.endsAt)} · {Math.round((new Date(campaign.endsAt).getTime() - new Date(campaign.startsAt).getTime()) / DAY) + 1} dias</p>
                  </div>
                  <span className={`plan-state state-${campaign.state.replace(" ", "-")}`}>{STATE_LABEL[campaign.state]}</span>
                </header>
                <p className="plan-objective">{campaign.objective}</p>
                <p className="plan-mechanic">{campaign.mechanic}</p>
                <div className="plan-chips">
                  {campaign.promoPercent > 0 ? <span>Promoção {campaign.promoPercent}% em {campaign.recipe.skus.length} {campaign.recipe.skus.length === 1 ? "peça" : "peças"}</span> : null}
                  {coupon ? <span>Cupom <b>{coupon.code}</b>: {coupon.kind === "PERCENT" ? `${coupon.value}%` : brl(coupon.value)} acima de {brl(coupon.minOrder)}{coupon.maxUses ? ` · até ${coupon.maxUses} usos` : ""}</span> : null}
                  {collection ? <span>Coleção &quot;{collection.title}&quot; ({collection.skus.length} peças)</span> : null}
                  {banner ? <span>Banner: {banner.title}</span> : null}
                </div>
                {worst !== null ? (
                  <button type="button" className={`plan-margin ${marginLevel(worst)}`} onClick={() => setOpen(open === campaign.id ? null : campaign.id)} aria-expanded={open === campaign.id}>
                    Menor margem com desconto: <b>{worst.toFixed(1).replace(".", ",")}%</b> {open === campaign.id ? "▲" : "▼ ver peças"}
                  </button>
                ) : null}
                {open === campaign.id && campaign.margins.length ? (
                  <div className="scroll-table">
                    <table className="costs-table plan-table">
                      <thead><tr><th>Peça</th><th className="money">Preço</th><th className="money">Com promoção</th><th className="money">Margem hoje</th><th className="money">Com promoção</th><th className="money">Pior caso (+ cupom)</th></tr></thead>
                      <tbody>
                        {campaign.margins.map((item) => (
                          <tr key={item.sku}>
                            <td>{item.sku} · {item.name}{item.inStore ? "" : <em className="plan-off"> fora da loja</em>}</td>
                            <td className="money">{brl(item.price)}</td>
                            <td className="money">{item.promoPrice !== item.price ? brl(item.promoPrice) : "—"}</td>
                            <td className="money">{item.margin.toFixed(1).replace(".", ",")}%</td>
                            <td className={`money ${marginLevel(item.marginPromo)}`}>{item.marginPromo.toFixed(1).replace(".", ",")}%</td>
                            <td className={`money ${marginLevel(item.marginWorst)}`}>{item.marginWorst.toFixed(1).replace(".", ",")}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <footer>
                  {canActivate ? <button type="button" className="primary-button" disabled={busy === campaign.id} onClick={() => void act(campaign, "ativar")}>{busy === campaign.id ? "Ativando..." : campaign.state === "pausada" ? "Retomar" : "Ativar"}</button> : null}
                  {canPause ? <button type="button" className="secondary-button" disabled={busy === campaign.id} onClick={() => void act(campaign, "pausar")}>{busy === campaign.id ? "Pausando..." : "Pausar"}</button> : null}
                  {campaign.state === "expirada" ? <span className="plan-note">A data já passou.</span> : null}
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
