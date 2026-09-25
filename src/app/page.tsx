"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { assessMargin } from "@/lib/costing";
import { displayNumber } from "@/lib/sales";

type DashboardData = {
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
};

type Material = { id: string; name: string; stockGrams: number; lowStockThresholdGrams: number };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  useEffect(() => {
    async function loadDashboard() {
      const [dashboardRes, materialsRes] = await Promise.all([fetch("/api/dashboard"), fetch("/api/materials")]);
      if (dashboardRes.status === 401) { setLoggedIn(false); return; }
      setLoggedIn(true);
      if (dashboardRes.ok) setData((await dashboardRes.json()) as DashboardData);
      if (materialsRes.ok) {
        const materials = (await materialsRes.json()) as Material[];
        setLowStock(materials.filter((item) => item.stockGrams <= item.lowStockThresholdGrams));
      }
    }
    loadDashboard().finally(() => setChecking(false));
  }, []);

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

  const margin = data ? assessMargin(data.marginPercent, 40) : null;
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
            {/* Tela Hoje (fase 2): primeiro o que é urgente, depois o que fazer,
                por último os números do negócio — antes eram 12 números com o
                mesmo peso e nenhuma tarefa. */}
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
              {data.ordersCount === 0 ? (
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

            <h2 className="today-section-title">Números do negócio</h2>
            <section className="today-money">
              <div><span>Vendido</span><strong className="num">{brl(data.totalSold)}</strong><small>{data.ordersCount} {data.ordersCount === 1 ? "venda" : "vendas"} · ticket {brl(data.ticketMedio)}</small></div>
              <div><span>Lucro bruto</span><strong className={neg(data.grossProfit) ?? "num"}>{brl(data.grossProfit)}</strong></div>
              <div><span>Margem líquida</span><strong className={neg(data.marginPercent) ?? "num"}>{data.marginPercent.toFixed(1).replace(".", ",")}%</strong><small>meta 40%</small></div>
              <div><span>Saldo de caixa</span><strong className={neg(data.cash.balance) ?? "num"}>{brl(data.cash.balance)}</strong></div>
              <div><span>A receber</span><strong className="num">{brl(data.cash.receivable)}</strong></div>
              <div><span>Projeção de caixa</span><strong className={neg(data.cash.projectedBalance) ?? "num"}>{brl(data.cash.projectedBalance)}</strong><small>saldo + a receber</small></div>
            </section>
            <p className="today-potential">
              <a href="/projects">Orçamentos em aberto: {data.openQuotes.count} · {brl(data.openQuotes.total)}</a>
              <span>potencial — só vira dinheiro quando o orçamento é aprovado e o recebimento registrado</span>
            </p>
          </>
        ) : (
          <div className="empty-note">Não foi possível carregar os dados do painel agora.</div>
        )}
      </div>
    </main>
  );
}
