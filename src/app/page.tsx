"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { assessMargin } from "@/lib/costing";
import { displayNumber } from "@/lib/sales";
import { brl } from "@/lib/money";

type DashboardData = {
  period: { kind: "day" | "month"; key: string; label: string; current: boolean; firstMonth: string; currentMonth: string; received: number; openFromPeriod: number; closingBalance: number | null };
  ordersEver: number;
  totalSold: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  ticketMedio: number;
  ordersCount: number;
  openProductionJobs: number;
  pendingProductionHours: number;
  activeProducts: number;
  lowStockMaterials: number;
  cash: { totalIn: number; totalOut: number; balance: number; receivable: number; projectedBalance: number };
  today: {
    toPrint: { id: string; name: string; quantity: number; status: string; minutes: number; priority: string; orderNumber: string; customer: string | null }[];
    deadlines: { id: string; orderNumber: string; productName: string; customer: string | null; dueDate: string }[];
    toCollect: { id: string; orderNumber: string; productName: string; customer: string | null; remaining: number }[];
    toDeliver: { id: string; orderNumber: string; productName: string; customer: string | null; dueDate: string | null; readySince: string }[];
  };
  openQuotes: { count: number; total: number };
  storeOrders: { id: string; code: string | null; customerName: string; customerPhone: string; productName: string; finalPrice: number; source: string; createdAt: string; waitingHours: number }[];
  competitors: {
    lastRun: { createdAt: string; checked: number; changed: number; unavailable: number; errors: number } | null;
    changes: {
      sku: string; name: string; price: number; medianBefore: number | null; medianAfter: number | null; recommendation: string; suggestedPrice: number | null;
      items: { competitor: string; url: string; status: string; oldPrice: number; newPrice: number | null }[];
    }[];
    missing: { sku: string; name: string }[];
  };
};

type Material = { id: string; name: string; stockGrams: number; lowStockThresholdGrams: number };

// Valor negativo (saldo, projeção, lucro) em vermelho — antes saía na mesma cor dos positivos.
const neg = (value: number) => (value < 0 ? "negative" : undefined);
const fmtMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
// Quantas linhas cada lista do Hoje mostra antes do "ver tudo".
const listLimit = 6;

/** "Quinta-feira, 24 de setembro" */
function todayLabel() {
  const text = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dias entre hoje e a data de entrega (negativo = vencido), comparando só o dia. */
function daysUntil(iso: string) {
  const due = new Date(iso);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const end = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((end - start) / 86400000);
}

/** "agora", "há 3 h", "há 2 dias" — tempo esperando resposta. */
function waitingLabel(hours: number) {
  if (hours < 1) return "agora";
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Link do WhatsApp do cliente com a primeira resposta pronta (DDI 55 se faltar). */
function whatsappLink(order: { customerName: string; customerPhone: string; code: string | null }) {
  const digits = order.customerPhone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  const first = order.customerName.trim().split(/\s+/)[0] || "";
  const text = `Olá${first ? `, ${first}` : ""}! Aqui é da AC3D Studio. Recebemos seu pedido${order.code ? ` nº ${order.code}` : ""} pela loja e já estamos conferindo. Posso confirmar os detalhes com você?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** "2026-10" ± n meses. */
function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function deadlineLabel(days: number) {
  if (days < 0) return days === -1 ? "venceu ontem" : `venceu há ${-days} dias`;
  if (days === 0) return "entrega hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

export default function HomePage() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [lowStock, setLowStock] = useState<Material[]>([]);
  // Números de vendas: sempre abre na foto de hoje; o mês é só para consulta.
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const [dashboardRes, materialsRes] = await Promise.all([fetch(month ? `/api/dashboard?mes=${month}` : "/api/dashboard"), fetch("/api/materials")]);
      if (dashboardRes.status === 401) { setLoggedIn(false); return; }
      setLoggedIn(true);
      if (dashboardRes.ok) setData((await dashboardRes.json()) as DashboardData);
      if (materialsRes.ok) {
        const materials = (await materialsRes.json()) as Material[];
        setLowStock(materials.filter((item) => item.stockGrams <= item.lowStockThresholdGrams));
      }
    }
    loadDashboard().finally(() => setChecking(false));
  }, [month]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) { setLoginError("E-mail ou senha inválidos."); return; }
    setPassword("");
    // Recarga completa: o menu lateral conferiu a sessão antes do login e só
    // apareceria depois de um F5 manual.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  if (checking) {
    return (
      <main className="admin-shell">
        <AdminHeader active="dashboard" />
        <div className="admin-content"><p className="library-loading">Carregando...</p></div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="admin-shell">
        <AdminHeader active="dashboard" />
        <div className="admin-content login-content">
          <form className="preset-form login-form" onSubmit={handleLogin}>
            <h2><span>◇</span> Entrar no AC3D</h2>
            <label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
            <label>Senha<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
            <button className="primary-button" type="submit">Entrar</button>
            {loginError ? <p className="admin-feedback">{loginError}</p> : null}
          </form>
        </div>
      </main>
    );
  }

  // Margem só faz sentido com venda no período (dia sem venda não é margem ruim).
  const margin = data && data.ordersCount ? assessMargin(data.marginPercent, 40) : null;
  const isDay = data?.period.kind === "day";
  const when = isDay ? "hoje" : "no mês";
  const overdue = data ? data.today.deadlines.filter((order) => daysUntil(order.dueDate) < 0) : [];
  const printMinutes = data ? data.today.toPrint.reduce((sum, item) => sum + item.minutes, 0) : 0;

  return (
    <main className="admin-shell">
      <AdminHeader active="dashboard" badges={{ library: lowStock.length || undefined }} />
      <div className="admin-content">
        <section className="library-heading">
          <div>
            <h1>Hoje</h1>
            <p>{todayLabel()}</p>
          </div>
        </section>

        {data ? (
          <>
            {/* Tela Hoje: primeiro os números do negócio (pedido do usuário em
                05/10/2026), depois o que é urgente e o que fazer. */}
            {/* Foto do dia (regra do usuário em 10/10/2026): vendas, lucro e
                recebido contam só hoje; o mês é consulta. Saldo e a receber
                são a posição de agora. */}
            <div className="today-period">
              <h2 className="today-section-title">Números do negócio</h2>
              <div className="today-period-switch" role="group" aria-label="Período">
                <button type="button" className={isDay ? "active" : undefined} aria-pressed={isDay} onClick={() => setMonth(null)}>Hoje</button>
                <button type="button" className={!isDay ? "active" : undefined} aria-pressed={!isDay} onClick={() => setMonth(month ?? data.period.currentMonth)}>Mês</button>
              </div>
              {!isDay ? (
                <div className="today-month-nav">
                  <button type="button" aria-label="Mês anterior" disabled={data.period.key <= data.period.firstMonth} onClick={() => setMonth(shiftMonth(data.period.key, -1))}>‹</button>
                  <strong>{data.period.label}</strong>
                  <button type="button" aria-label="Próximo mês" disabled={data.period.current} onClick={() => setMonth(shiftMonth(data.period.key, 1))}>›</button>
                </div>
              ) : null}
            </div>
            <section className="today-money">
              <div>
                <span>Vendido {when}</span>
                <strong className="num">{brl(data.totalSold)}</strong>
                <small>{data.ordersCount ? `${data.ordersCount} ${data.ordersCount === 1 ? "venda" : "vendas"} · ticket ${brl(data.ticketMedio)}` : isDay ? "nenhuma venda hoje" : "nenhuma venda no mês"}</small>
              </div>
              <div><span>Lucro bruto {when}</span><strong className={neg(data.grossProfit) ?? "num"}>{brl(data.grossProfit)}</strong><small>das vendas {isDay ? "de hoje" : "do mês"}</small></div>
              <div><span>Margem {when}</span><strong className={neg(data.marginPercent) ?? "num"}>{data.ordersCount ? `${data.marginPercent.toFixed(1).replace(".", ",")}%` : "—"}</strong><small>meta 40%</small></div>
              <div><span>Recebido {when}</span><strong className={neg(data.period.received) ?? "num"}>{brl(data.period.received)}</strong><small>pagamentos que entraram no caixa</small></div>
              {data.period.closingBalance !== null ? (
                <div><span>Saldo no fim do mês</span><strong className={neg(data.period.closingBalance) ?? "num"}>{brl(data.period.closingBalance)}</strong></div>
              ) : (
                <div><span>Saldo de caixa agora</span><strong className={neg(data.cash.balance) ?? "num"}>{brl(data.cash.balance)}</strong><small>projeção <span className="num">{brl(data.cash.projectedBalance)}</span> com o a receber</small></div>
              )}
              {isDay ? (
                <div><span>A receber agora</span><strong className="num">{brl(data.cash.receivable)}</strong><small>de todas as vendas em aberto</small></div>
              ) : (
                <div><span>Falta receber</span><strong className="num">{brl(data.period.openFromPeriod)}</strong><small>das vendas do mês</small></div>
              )}
            </section>
            <p className="today-potential">
              <a href="/projects">Orçamentos em aberto: {data.openQuotes.count} · {brl(data.openQuotes.total)}</a>
              <span>potencial — só vira dinheiro quando o orçamento é aprovado e o recebimento registrado</span>
            </p>

            {data.storeOrders.length ? (
              <section className="today-list store-orders-alert" aria-labelledby="store-orders-title">
                <header>
                  <h2 id="store-orders-title">Pedidos da loja aguardando resposta <b>{data.storeOrders.length}</b></h2>
                  <span>responda pelo WhatsApp e converta em venda quando fechar</span>
                </header>
                <ul>
                  {data.storeOrders.map((order) => (
                    <li key={order.id}>
                      <a href={`/orcamentos?quoteId=${order.id}`}>
                        <span className="today-item-main">
                          {order.productName}
                          {order.source === "loja-encomenda" ? <em className="today-tag">encomenda</em> : null}
                          <em className={order.waitingHours >= 24 ? "today-tag urgent" : "today-tag"}>{waitingLabel(order.waitingHours)}</em>
                        </span>
                        <small>{order.code ? `${displayNumber(order.code)} · ` : ""}{order.customerName || "sem nome"}{order.finalPrice ? ` · ${brl(order.finalPrice)}` : " · a orçar"}</small>
                      </a>
                      {whatsappLink(order) ? <a className="secondary-button store-order-reply" href={whatsappLink(order)!} target="_blank" rel="noreferrer">Responder no WhatsApp</a> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="dashboard-alerts">
              {data.cash.balance < 0 ? (
                <p className="sim-alert sim-bad">
                  <strong>Caixa negativo: {brl(data.cash.balance)}.</strong> <a href="/cashflow">Ver Caixa</a>
                </p>
              ) : null}
              {overdue.length ? (
                <p className="sim-alert sim-bad">
                  <strong>{overdue.length === 1 ? "1 pedido com prazo vencido" : `${overdue.length} pedidos com prazo vencido`}.</strong> <a href="/production">Ver Produção</a>
                </p>
              ) : null}
              {margin && margin.level !== "good" ? <p className={`sim-alert sim-${margin.level}`}>{margin.message}</p> : null}
              {lowStock.length ? (
                <p className="sim-alert sim-warning">
                  Estoque baixo: {lowStock.map((item) => item.name).join(", ")}. <a href="/admin">Repor na Biblioteca</a>
                </p>
              ) : null}
              {data.ordersEver === 0 ? (
                <p className="sim-alert sim-warning">Nenhuma venda registrada ainda. Comece pelo <a href="/catalog">Catálogo</a> e depois em <Link href="/sales">Vendas</Link>.</p>
              ) : null}
            </div>

            <section className="today-lists">
              <article className="today-list">
                <header>
                  <h2>Imprimir <b>{data.today.toPrint.length}</b></h2>
                  {printMinutes ? <span className="num">{fmtMinutes(printMinutes)} no total</span> : null}
                </header>
                {data.today.toPrint.length ? (
                  <ul>
                    {data.today.toPrint.slice(0, listLimit).map((item) => (
                      <li key={item.id}>
                        <a href="/production">
                          <span className="today-item-main">
                            {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                            {item.status === "PRINTING" ? <em className="today-tag">na impressora</em> : null}
                            {item.priority === "URGENT" || item.priority === "HIGH" ? <em className="today-tag urgent">{item.priority === "URGENT" ? "urgente" : "prioridade alta"}</em> : null}
                          </span>
                          <small>{displayNumber(item.orderNumber)}{item.customer ? ` · ${item.customer}` : ""}</small>
                        </a>
                        <span className="today-item-side num">{item.minutes ? fmtMinutes(item.minutes) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="today-empty">Nada na fila de impressão.</p>}
                <a className="today-more" href="/production">{data.today.toPrint.length > listLimit ? `Ver todas as ${data.today.toPrint.length} peças` : "Abrir Produção"}</a>
              </article>

              <article className="today-list">
                <header>
                  <h2>Entregar <b>{data.today.toDeliver.length}</b></h2>
                  <span>produção concluída</span>
                </header>
                {data.today.toDeliver.length ? (
                  <ul>
                    {data.today.toDeliver.slice(0, listLimit).map((order) => {
                      const days = order.dueDate ? daysUntil(order.dueDate) : null;
                      return (
                        <li key={order.id}>
                          <Link href={`/sales/${order.id}`}>
                            <span className="today-item-main">{order.productName}</span>
                            <small>{displayNumber(order.orderNumber)}{order.customer ? ` · ${order.customer}` : ""}</small>
                          </Link>
                          <span className={days !== null && days < 0 ? "today-item-side negative" : days !== null && days <= 2 ? "today-item-side soon" : "today-item-side"}>
                            {days !== null ? deadlineLabel(days) : "sem prazo"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="today-empty">Nada pronto esperando entrega.</p>}
                <Link className="today-more" href="/sales">Abrir Vendas</Link>
              </article>

              <article className="today-list">
                <header>
                  <h2>Cobrar <b>{data.today.toCollect.length}</b></h2>
                  {data.cash.receivable ? <span className="num">{brl(data.cash.receivable)} a receber</span> : null}
                </header>
                {data.today.toCollect.length ? (
                  <ul>
                    {data.today.toCollect.slice(0, listLimit).map((order) => (
                      <li key={order.id}>
                        <Link href={`/sales/${order.id}`}>
                          <span className="today-item-main">{order.productName}</span>
                          <small>{displayNumber(order.orderNumber)}{order.customer ? ` · ${order.customer}` : ""}</small>
                        </Link>
                        <span className="today-item-side num">{brl(order.remaining)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="today-empty">Nenhum valor pendente. Tudo recebido.</p>}
                <Link className="today-more" href="/sales">Abrir Vendas</Link>
              </article>
            </section>

            <section className="today-list today-competitors">
              <header>
                <h2>Concorrentes mudaram de preço <b>{data.competitors.changes.length}</b></h2>
                <span>
                  {data.competitors.lastRun
                    ? `verificado ${new Date(data.competitors.lastRun.createdAt).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${data.competitors.lastRun.checked} anúncios${data.competitors.lastRun.errors ? ` · ${data.competitors.lastRun.errors} sem leitura` : ""}`
                    : "a verificação roda às terças e sextas"}
                </span>
              </header>
              {data.competitors.changes.length ? (
                <ul>
                  {data.competitors.changes.map((product) => (
                    <li key={product.sku} className="competitor-change">
                      <div className="competitor-change-head">
                        <a href={`/catalog?aba=concorrencia&busca=${encodeURIComponent(product.sku)}`}>
                          <span className="today-item-main">{product.name}</span>
                          <small>{product.sku} · seu preço {brl(product.price)}{product.medianBefore !== null && product.medianAfter !== null ? ` · mediana ${brl(product.medianBefore)} → ${brl(product.medianAfter)}` : ""}</small>
                        </a>
                        {product.suggestedPrice ? <span className="today-item-side num">sugerido {brl(product.suggestedPrice)}</span> : null}
                      </div>
                      <ul className="competitor-change-items">
                        {product.items.map((item, index) => (
                          <li key={`${item.url}-${index}`}>
                            <a href={item.url} target="_blank" rel="noreferrer">{item.competitor}</a>
                            <span className="num">
                              {item.status === "INDISPONIVEL"
                                ? "saiu do ar"
                                : <>{brl(item.oldPrice)} → <b className={item.newPrice! < item.oldPrice ? "negative" : "positive"}>{brl(item.newPrice!)}</b></>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="competitor-change-tip">{product.recommendation}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="today-empty">{data.competitors.lastRun ? "Nenhuma mudança de preço na última verificação." : "Ainda sem verificação de preços."}</p>
              )}
              {data.competitors.missing.length ? (
                <p className="today-competitor-missing">
                  Sem pesquisa de concorrente: {data.competitors.missing.map((item) => `${item.sku} ${item.name}`).join(" · ")}
                </p>
              ) : null}
              <a className="today-more" href="/catalog?aba=concorrencia">Abrir Concorrência</a>
            </section>

          </>
        ) : (
          <div className="empty-note">Não foi possível carregar os dados do painel agora.</div>
        )}
      </div>
    </main>
  );
}
