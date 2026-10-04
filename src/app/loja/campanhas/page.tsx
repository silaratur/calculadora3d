"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { brl } from "@/lib/money";

/**
 * Loja → Campanhas: o que a loja está gerando (medição própria + pedidos reais)
 * e o calendário de tudo que está no ar ou agendado.
 */
type CalendarItem = { kind: "banner" | "colecao" | "promocao" | "cupom"; label: string; start: string; end: string; status: string; detail: string };
type Data = {
  days: number;
  traffic: { visits: number; viewedProduct: number; addedToCart: number; leads: number; productViews: number };
  daily: { date: string; visits: number; leads: number }[];
  orders: { count: number; total: number; converted: number };
  sources: { source: string; visits: number; leads: number }[];
  topProducts: { sku: string; name: string; views: number; adds: number }[];
  campaigns: { key: string; label: string; visits: number; views: number; adds: number; leads: number }[];
  calendar: { from: string; to: string; items: CalendarItem[]; posts: { date: string; title: string; kind: string; status: string }[]; dates: { date: string; label: string }[] };
  measuringSince: string | null;
};

const PERIODS = [7, 30, 90];
const kindLabel: Record<CalendarItem["kind"], string> = { banner: "Banner", colecao: "Coleção", promocao: "Promoção", cupom: "Cupom" };
const kindLink: Record<CalendarItem["kind"], string> = { banner: "/loja/vitrine", colecao: "/loja/vitrine", promocao: "/loja/promocoes", cupom: "/loja/promocoes" };
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1).replace(".", ",")}%` : "—");
/** "2026-10-04" (dia já em Brasília) ou ISO completo → "04/10". */
const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));

export default function CampaignsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/loja/campanhas?dias=${days}`, { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) { setNeedsLogin(true); return; }
      if (response.ok) setData((await response.json()) as Data);
    });
    return () => { cancelled = true; };
  }, [days]);

  const traffic = data?.traffic;
  const funnel = traffic ? [
    { label: "Visitaram a loja", value: traffic.visits },
    { label: "Abriram uma peça", value: traffic.viewedProduct },
    { label: "Puseram na sacola", value: traffic.addedToCart },
    { label: "Enviaram o pedido", value: traffic.leads },
  ] : [];
  const maxDaily = Math.max(1, ...(data?.daily.map((row) => row.visits) ?? [0]));

  // Calendário: posição em % entre o início e o fim da janela.
  const from = data ? new Date(data.calendar.from).getTime() : 0;
  const to = data ? new Date(data.calendar.to).getTime() : 1;
  const position = (iso: string) => Math.min(100, Math.max(0, ((new Date(iso).getTime() - from) / (to - from)) * 100));
  const months = data ? (() => {
    const list: { label: string; left: number }[] = [];
    const cursor = new Date(from);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() < to) {
      list.push({ label: cursor.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), left: position(cursor.toISOString()) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return list;
  })() : [];
  const todayLeft = data ? position(new Date().toISOString()) : 0;

  return (
    <main className="admin-shell">
      <AdminHeader active="loja-campanhas" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver as campanhas." /> : null}
        <section className="library-heading">
          <div>
            <h1>Campanhas</h1>
            <p>Resultado da loja e calendário de coleções, banners, promoções, cupons e posts.</p>
          </div>
          <div className="catalog-sort">
            <span>Período</span>
            {PERIODS.map((value) => <button key={value} type="button" className={days === value ? "chip selected" : "chip"} onClick={() => setDays(value)}>{value} dias</button>)}
          </div>
        </section>

        {!data ? <p className="library-loading">Carregando...</p> : (
          <>
            {data.measuringSince ? (
              data.measuringSince.slice(0, 10) > data.daily[0].date
                ? <p className="field-hint campaign-note">A medição da loja começou em {day(data.measuringSince)}: antes disso não há visitas registradas.</p>
                : null
            ) : <p className="sim-alert sim-warning campaign-note">Ainda não há visitas medidas. Os números aparecem conforme os clientes visitam a loja.</p>}

            <section className="today-money campaign-numbers">
              <div><span>Visitas</span><strong className="num">{traffic!.visits}</strong><small>últimos {data.days} dias</small></div>
              <div><span>Abriram uma peça</span><strong className="num">{traffic!.viewedProduct}</strong><small>{pct(traffic!.viewedProduct, traffic!.visits)} das visitas · {traffic!.productViews} peças vistas</small></div>
              <div><span>Puseram na sacola</span><strong className="num">{traffic!.addedToCart}</strong><small>{pct(traffic!.addedToCart, traffic!.visits)} das visitas</small></div>
              <div><span>Enviaram pedido</span><strong className="num">{traffic!.leads}</strong><small>conversão {pct(traffic!.leads, traffic!.visits)}</small></div>
              <div><span>Pedidos registrados</span><strong className="num">{data.orders.count}</strong><small>{data.orders.converted} viraram venda</small></div>
              <div><span>Valor dos pedidos</span><strong className="num">{brl(data.orders.total)}</strong><small>pedidos da loja no período</small></div>
            </section>

            <div className="campaign-grid">
              <section className="preset-form">
                <h2>Funil da loja</h2>
                <ol className="funnel">
                  {funnel.map((step, index) => (
                    <li key={step.label}>
                      <span className="funnel-label">{step.label}</span>
                      <span className="funnel-bar"><span style={{ width: `${funnel[0].value ? Math.max(2, (step.value / funnel[0].value) * 100) : 0}%` }} /></span>
                      <span className="funnel-value num">{step.value}{index ? <small>{pct(step.value, funnel[index - 1].value)} da etapa anterior</small> : null}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="preset-form">
                <h2>Visitas por dia</h2>
                <div className="daily-chart" role="img" aria-label={`Visitas por dia nos últimos ${data.days} dias; máximo ${maxDaily}`}>
                  {data.daily.map((row) => (
                    <span key={row.date} className="daily-bar" title={`${day(row.date)}: ${row.visits} visita(s), ${row.leads} pedido(s)`}>
                      <span style={{ height: `${(row.visits / maxDaily) * 100}%` }} className={row.leads ? "with-lead" : undefined} />
                    </span>
                  ))}
                </div>
                <div className="daily-axis"><span>{day(data.daily[0].date)}</span><span>máx. {maxDaily}/dia</span><span>{day(data.daily[data.daily.length - 1].date)}</span></div>
                <p className="field-hint">Barras mais escuras: dias com pedido enviado.</p>
              </section>
            </div>

            <div className="campaign-grid">
              <section className="preset-form">
                <h2>Resultado por origem</h2>
                <p className="field-hint">De onde as peças foram abertas. O pedido conta para toda origem que a visita usou.</p>
                {data.campaigns.length ? (
                  <div className="promo-table-wrap">
                    <table className="promo-table">
                      <thead><tr><th>Origem</th><th>Visitas</th><th>Peças vistas</th><th>Sacola</th><th>Pedidos</th><th>Conversão</th></tr></thead>
                      <tbody>
                        {data.campaigns.map((row) => (
                          <tr key={row.key}><td><b>{row.label}</b></td><td className="num">{row.visits}</td><td className="num">{row.views}</td><td className="num">{row.adds}</td><td className="num">{row.leads}</td><td className="num">{pct(row.leads, row.visits)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="today-empty">Sem dados no período.</p>}
              </section>
              <section className="preset-form">
                <h2>Canais</h2>
                <p className="field-hint">Por onde o cliente chegou na primeira visita (Instagram, WhatsApp, Google, direto…).</p>
                {data.sources.length ? (
                  <div className="promo-table-wrap">
                    <table className="promo-table">
                      <thead><tr><th>Canal</th><th>Visitas</th><th>Pedidos</th><th>Conversão</th></tr></thead>
                      <tbody>
                        {data.sources.map((row) => <tr key={row.source}><td><b>{row.source}</b></td><td className="num">{row.visits}</td><td className="num">{row.leads}</td><td className="num">{pct(row.leads, row.visits)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="today-empty">Sem dados no período.</p>}
              </section>
            </div>

            <section className="preset-form campaign-block">
              <h2>Peças mais vistas</h2>
              {data.topProducts.length ? (
                <div className="promo-table-wrap">
                  <table className="promo-table">
                    <thead><tr><th>Peça</th><th>Vezes aberta</th><th>Postas na sacola</th><th>Da vista para a sacola</th></tr></thead>
                    <tbody>
                      {data.topProducts.map((row) => <tr key={row.sku}><td><Link href={`/catalog?editar=${encodeURIComponent(row.sku)}`}><b>{row.name}</b></Link><small>{row.sku}</small></td><td className="num">{row.views}</td><td className="num">{row.adds}</td><td className="num">{pct(row.adds, row.views)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <p className="today-empty">Nenhuma peça aberta no período.</p>}
            </section>

            <section className="preset-form campaign-block">
              <h2>Calendário</h2>
              <p className="field-hint">De {day(data.calendar.from)} a {day(data.calendar.to)}. A linha vertical é hoje; as datas comerciais aparecem no topo.</p>
              <div className="timeline">
                <div className="timeline-head">
                  {months.map((month) => <span key={month.label + month.left} className="timeline-month" style={{ left: `${month.left}%` }}>{month.label}</span>)}
                  {data.calendar.dates.map((item, index) => <span key={item.label + item.date} className={index % 2 ? "timeline-date low" : "timeline-date"} style={{ left: `${position(item.date)}%` }} title={`${item.label} · ${day(item.date)}`}>{item.label}</span>)}
                </div>
                <div className="timeline-body">
                  <span className="timeline-today" style={{ left: `${todayLeft}%` }} aria-hidden="true" />
                  {data.calendar.dates.map((item) => <span key={`line-${item.label}${item.date}`} className="timeline-date-line" style={{ left: `${position(item.date)}%` }} aria-hidden="true" />)}
                  {data.calendar.items.length ? data.calendar.items.map((item, index) => (
                    <Link key={`${item.kind}-${index}`} href={kindLink[item.kind]} className={`timeline-row kind-${item.kind} status-${item.status.replace(/\s/g, "-")}`}>
                      <span className="timeline-bar" style={{ left: `${position(item.start)}%`, width: `${Math.max(1.5, position(item.end) - position(item.start))}%` }} title={`${kindLabel[item.kind]}: ${item.label} · ${day(item.start)} a ${day(item.end)} · ${item.status} · ${item.detail}`}>
                        <span>{kindLabel[item.kind]} · {item.label}</span>
                      </span>
                    </Link>
                  )) : <p className="today-empty timeline-empty">Nada no ar nem agendado. Crie coleções e banners em <Link href="/loja/vitrine">Vitrine</Link> e promoções e cupons em <Link href="/loja/promocoes">Promoções</Link>.</p>}
                  {data.calendar.posts.length ? (
                    <div className="timeline-row timeline-posts">
                      {data.calendar.posts.map((post, index) => <span key={index} className="timeline-post" style={{ left: `${position(post.date)}%` }} title={`${post.kind}: ${post.title} · ${day(post.date)}`} />)}
                      <span className="timeline-posts-label">Posts do Instagram ({data.calendar.posts.length})</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="timeline-legend">
                {(Object.keys(kindLabel) as CalendarItem["kind"][]).map((kind) => <span key={kind} className={`legend-${kind}`}>{kindLabel[kind]}</span>)}
                <span className="legend-post">Post do Instagram</span>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
