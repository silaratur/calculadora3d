"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { assessMargin } from "@/lib/costing";

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
};

type Material = { id: string; name: string; stockGrams: number; lowStockThresholdGrams: number };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Valor negativo (saldo, projeção, lucro) em vermelho — antes saía na mesma cor dos positivos.
const neg = (value: number) => (value < 0 ? "negative" : undefined);

export default function HomePage() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [lowStock, setLowStock] = useState<Material[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

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
  }, [reloadToken]);

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
    reload();
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

  return (
    <main className="admin-shell">
      <AdminHeader active="dashboard" badges={{ library: lowStock.length || undefined }} />
      <div className="admin-content">
        <section className="library-heading">
          <div>
            <h1>Painel</h1>
            <p>Visão geral do negócio — vendas, produção e caixa num só lugar.</p>
          </div>
        </section>

        {data ? (
          <>
            <section className="production-stats dashboard-stats">
              <div><span>Total Vendido</span><strong>{brl(data.totalSold)}</strong></div>
              <div><span>Lucro Bruto</span><strong className={neg(data.grossProfit)}>{brl(data.grossProfit)}</strong></div>
              <div><span>Ticket Médio</span><strong>{brl(data.ticketMedio)}</strong></div>
              <div><span>Nº Vendas</span><strong>{data.ordersCount}</strong></div>
              <div><span>Saldo de Caixa</span><strong className={neg(data.cash.balance)}>{brl(data.cash.balance)}</strong></div>
              <div><span>A Receber</span><strong>{brl(data.cash.receivable)}</strong></div>
              <div><span>Projeção de Caixa</span><strong className={neg(data.cash.projectedBalance)}>{brl(data.cash.projectedBalance)}</strong></div>
              <div><span>Pedidos em Produção</span><strong>{data.openProductionJobs}</strong></div>
              <div><span>Horas Pend. Produção</span><strong>{data.pendingProductionHours.toFixed(1)}h</strong></div>
              <div><span>Produtos Ativos</span><strong>{data.activeProducts}</strong></div>
              <div><span>Estoque Baixo</span><strong>{data.lowStockMaterials}</strong></div>
              <div><span>Margem Líquida</span><strong className={neg(data.marginPercent)}>{data.marginPercent.toFixed(1)}%</strong></div>
            </section>

            <div className="dashboard-alerts">
              {margin ? <p className={`sim-alert sim-${margin.level}`}>{margin.message}</p> : null}
              {lowStock.length ? (
                <p className="sim-alert sim-warning">
                  Estoque baixo: {lowStock.map((item) => item.name).join(", ")}. <a href="/admin">Repor na Biblioteca →</a>
                </p>
              ) : null}
              {data.ordersCount === 0 ? (
                <p className="sim-alert sim-warning">Nenhuma venda registrada ainda. Comece pelo <a href="/catalog">Catálogo</a> e depois em <a href="/sales">Vendas</a>.</p>
              ) : null}
            </div>

            <section className="dashboard-shortcuts">
              <a className="load-editor-button" href="/orcamentos">Nova Precificação</a>
              <a className="load-editor-button" href="/sales">Registrar Venda</a>
              <a className="load-editor-button" href="/production">Ver Produção</a>
              <a className="load-editor-button" href="/cashflow">Fluxo de Caixa</a>
            </section>
          </>
        ) : (
          <div className="empty-note">Não foi possível carregar os dados do painel agora.</div>
        )}
      </div>
    </main>
  );
}
