"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IconBook,
  IconCalculator,
  IconCirclePlus,
  IconFolder,
  IconGrid,
  IconHome,
  IconLogout,
  IconPrinter,
  IconSettings,
  IconSparkles,
  IconTag,
  IconUser,
  IconCoins,
  IconWallet,
} from "@/components/Icons";

type Section =
  | "dashboard"
  | "calculator"
  | "library"
  | "catalog"
  | "catalogNew"
  | "customers"
  | "projects"
  | "sales"
  | "production"
  | "costs"
  | "cashflow"
  | "settings";

const links: { id: Section; href: string; label: string; icon: (props: { className?: string }) => React.ReactElement }[] = [
  { id: "dashboard", href: "/", label: "Painel", icon: IconHome },
  { id: "calculator", href: "/calculator", label: "Calculadora", icon: IconCalculator },
  { id: "library", href: "/admin", label: "Biblioteca", icon: IconBook },
  { id: "catalog", href: "/catalog", label: "Catálogo", icon: IconGrid },
  // Área em teste (ver DEPLOY.md/memória do projeto) — vai substituir /catalog
  // quando validada; por ora convivem em paralelo.
  { id: "catalogNew", href: "/catalog-new", label: "Catálogo Novo", icon: IconSparkles },
  { id: "customers", href: "/customers", label: "Clientes", icon: IconUser },
  { id: "projects", href: "/projects", label: "Projetos", icon: IconFolder },
  { id: "sales", href: "/sales", label: "Vendas", icon: IconTag },
  { id: "production", href: "/production", label: "Produção", icon: IconPrinter },
  { id: "costs", href: "/costs", label: "Custos", icon: IconCoins },
  { id: "cashflow", href: "/cashflow", label: "Caixa", icon: IconWallet },
  { id: "settings", href: "/settings", label: "Configurações", icon: IconSettings },
];

export function AdminHeader({ active, badges }: { active: Section; badges?: Partial<Record<Section, number>> }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { email?: string } | null) => { if (!cancelled) setEmail(data?.email ?? null); })
      .catch(() => { if (!cancelled) setEmail(null); });
    return () => { cancelled = true; };
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    // Recarga completa de propósito: cada página guarda seu próprio estado de
    // sessão em useEffect isolado; um router.push não os re-executaria em
    // toda a árvore, deixando telas "logadas" na aparência até um F5 manual.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <header className="admin-topbar">
      <Link className="admin-brand" href="/">
        <span className="brand-mark" role="img" aria-label="AC3D" />
        <span>
          <span className="admin-brand-title"><strong>AC3D</strong><span className="brand-tag">PRECIFICAÇÃO</span></span>
          <small>PAINEL DE PRECIFICAÇÃO & LOGÍSTICA</small>
        </span>
      </Link>
      <nav className="admin-nav" aria-label="Navegação principal">
        {links.map((link) => {
          const badge = badges?.[link.id];
          const Icon = link.icon;
          return (
            <Link key={link.id} className={link.id === active ? "active" : undefined} href={link.href}>
              <Icon className="nav-icon" />
              {link.label}
              {badge ? <b>{badge}</b> : null}
            </Link>
          );
        })}
      </nav>
      <Link className="new-order-cta" href="/calculator">
        <IconCirclePlus className="nav-icon" /> Novo Orçamento
      </Link>
      <div className="admin-account">
        {email ?? ""}
        {email ? <button className="logout-button" onClick={logout} aria-label="Sair" title="Sair"><IconLogout className="nav-icon" /></button> : null}
      </div>
    </header>
  );
}
