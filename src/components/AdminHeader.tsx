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
  IconMenu,
  IconPrinter,
  IconSettings,
  IconTag,
  IconUser,
  IconUsers,
  IconCoins,
  IconWallet,
  IconX,
} from "@/components/Icons";
import { canAccessPath } from "@/lib/roles";

type Section =
  | "dashboard"
  | "calculator"
  | "library"
  | "catalog"
  | "customers"
  | "projects"
  | "sales"
  | "production"
  | "costs"
  | "cashflow"
  | "settings"
  | "users";

const links: { id: Section; href: string; label: string; icon: (props: { className?: string }) => React.ReactElement }[] = [
  { id: "dashboard", href: "/", label: "Painel", icon: IconHome },
  { id: "calculator", href: "/calculator", label: "Calculadora", icon: IconCalculator },
  { id: "library", href: "/admin", label: "Biblioteca", icon: IconBook },
  { id: "catalog", href: "/catalog", label: "Catálogo", icon: IconGrid },
  { id: "customers", href: "/customers", label: "Clientes", icon: IconUser },
  { id: "projects", href: "/projects", label: "Projetos", icon: IconFolder },
  { id: "sales", href: "/sales", label: "Vendas", icon: IconTag },
  { id: "production", href: "/production", label: "Produção", icon: IconPrinter },
  { id: "costs", href: "/costs", label: "Custos", icon: IconCoins },
  { id: "cashflow", href: "/cashflow", label: "Caixa", icon: IconWallet },
  { id: "settings", href: "/settings", label: "Configurações", icon: IconSettings },
  { id: "users", href: "/users", label: "Usuários", icon: IconUsers },
];

export function AdminHeader({ active, badges }: { active: Section; badges?: Partial<Record<Section, number>> }) {
  // Enquanto não confirma sessão válida (ou se não tiver), nenhuma opção de
  // menu aparece — só a logo. O middleware (src/middleware.ts) já barra o
  // acesso às páginas protegidas sem sessão; isto cobre a "/" (login), onde
  // o AdminHeader roda mesmo deslogado, e evita o menu inteiro piscar antes
  // da checagem de sessão terminar.
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("ADMIN");
  // Em telas estreitas o menu inteiro (12 links) não cabe numa linha — em vez
  // de quebrar em várias linhas e o cabeçalho (sticky) tomar a tela toda como
  // um "frame", ele vira um painel recolhível aberto por este botão.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { email?: string; role?: string } | null) => {
        if (cancelled) return;
        setEmail(data?.email ?? null);
        setRole(data?.role ?? "ADMIN");
        setStatus(data?.email ? "authenticated" : "unauthenticated");
      })
      .catch(() => { if (!cancelled) { setEmail(null); setStatus("unauthenticated"); } });
    return () => { cancelled = true; };
  }, []);

  // Mesma regra do proxy (src/lib/roles.ts) — um perfil restrito não vê no
  // menu nem o link de uma área que, se clicasse, o proxy mandaria de volta.
  const visibleLinks = links.filter((link) => canAccessPath(role, link.href));
  const canUseCalculator = canAccessPath(role, "/calculator");

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
      {status === "authenticated" ? (
        <>
          <button
            className="mobile-menu-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <IconX className="nav-icon" /> : <IconMenu className="nav-icon" />}
          </button>
          {menuOpen ? <button className="mobile-menu-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} /> : null}
          <div className={menuOpen ? "admin-nav-panel open" : "admin-nav-panel"}>
            <nav className="admin-nav" aria-label="Navegação principal">
              {visibleLinks.map((link) => {
                const badge = badges?.[link.id];
                const Icon = link.icon;
                return (
                  <Link key={link.id} className={link.id === active ? "active" : undefined} href={link.href} onClick={() => setMenuOpen(false)}>
                    <Icon className="nav-icon" />
                    {link.label}
                    {badge ? <b>{badge}</b> : null}
                  </Link>
                );
              })}
            </nav>
            {canUseCalculator ? (
              <Link className="new-order-cta" href="/calculator" onClick={() => setMenuOpen(false)}>
                <IconCirclePlus className="nav-icon" /> Novo Orçamento
              </Link>
            ) : null}
          </div>
          <div className="admin-account">
            {email ?? ""}
            <button className="logout-button" onClick={logout} aria-label="Sair" title="Sair"><IconLogout className="nav-icon" /></button>
          </div>
        </>
      ) : null}
    </header>
  );
}
