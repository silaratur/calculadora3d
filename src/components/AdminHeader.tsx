"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IconBook,
  IconCirclePlus,
  IconFileText,
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
import { ThemeToggle } from "@/components/ThemeToggle";

type Section =
  | "dashboard"
  | "calculator"
  | "orcamentos"
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

type NavLink = {
  id: Section;
  /** Destino preferido e alternativas, na ordem — vale o primeiro que o perfil pode abrir. */
  hrefs: string[];
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  /** Outras telas em que este item fica marcado como atual. */
  alsoActive?: Section[];
};

// Menu agrupado pelas etapas do trabalho (fase 2 da reformulação), em vez de
// 12 itens soltos em duas linhas. "Orçamentos" é a lista (Projetos) e também
// fica marcado no editor; quem só pode usar o editor (perfil Calculadora) cai
// direto nele.
const home: NavLink = { id: "dashboard", hrefs: ["/"], label: "Hoje", icon: IconHome };
const groups: { label: string; links: NavLink[] }[] = [
  {
    label: "Vender",
    links: [
      { id: "projects", hrefs: ["/projects", "/orcamentos"], label: "Orçamentos", icon: IconFileText, alsoActive: ["orcamentos", "calculator"] },
      { id: "sales", hrefs: ["/sales"], label: "Vendas", icon: IconTag },
      { id: "customers", hrefs: ["/customers"], label: "Clientes", icon: IconUser },
    ],
  },
  {
    label: "Produzir",
    links: [
      { id: "production", hrefs: ["/production"], label: "Produção", icon: IconPrinter },
      { id: "catalog", hrefs: ["/catalog"], label: "Catálogo", icon: IconGrid },
      { id: "library", hrefs: ["/admin"], label: "Biblioteca", icon: IconBook },
    ],
  },
  {
    label: "Dinheiro",
    links: [
      { id: "cashflow", hrefs: ["/cashflow"], label: "Caixa", icon: IconWallet },
      { id: "costs", hrefs: ["/costs"], label: "Custos", icon: IconCoins },
    ],
  },
];
const accountLinks: NavLink[] = [
  { id: "settings", hrefs: ["/settings"], label: "Configurações", icon: IconSettings },
  { id: "users", hrefs: ["/users"], label: "Usuários", icon: IconUsers },
];
// Barra inferior do celular: as telas de uso diário; o resto fica em "Mais".
const tabIds: Section[] = ["dashboard", "projects", "production", "catalog"];

export function AdminHeader({ active, badges }: { active: Section; badges?: Partial<Record<Section, number>> }) {
  // Enquanto não confirma sessão válida (ou se não tiver), nenhuma opção de
  // menu aparece — só a logo. O middleware (src/middleware.ts) já barra o
  // acesso às páginas protegidas sem sessão; isto cobre a "/" (login), onde
  // o AdminHeader roda mesmo deslogado, e evita o menu inteiro piscar antes
  // da checagem de sessão terminar.
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("ADMIN");
  // Painel "Mais" do celular (tudo que não cabe nas 4 abas da barra inferior).
  const [moreOpen, setMoreOpen] = useState(false);

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

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Mesma regra do proxy (src/lib/roles.ts) — um perfil restrito não vê no
  // menu nem o link de uma área que, se clicasse, o proxy mandaria de volta.
  const hrefFor = (link: NavLink) => link.hrefs.find((href) => canAccessPath(role, href)) ?? null;
  const isActive = (link: NavLink) => link.id === active || Boolean(link.alsoActive?.includes(active));
  const canUseOrcamentos = canAccessPath(role, "/orcamentos");
  const visibleGroups = groups
    .map((group) => ({ ...group, links: group.links.filter((link) => hrefFor(link)) }))
    .filter((group) => group.links.length);
  const visibleAccount = accountLinks.filter((link) => hrefFor(link));
  const allVisible = [home, ...visibleGroups.flatMap((group) => group.links), ...visibleAccount].filter((link) => hrefFor(link));
  const tabs = tabIds.map((id) => allVisible.find((link) => link.id === id)).filter((link): link is NavLink => Boolean(link));
  const moreHasActive = !tabs.some(isActive);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    // Recarga completa de propósito: cada página guarda seu próprio estado de
    // sessão em useEffect isolado; um router.push não os re-executaria em
    // toda a árvore, deixando telas "logadas" na aparência até um F5 manual.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  const brand = (
    <Link className="admin-brand" href="/">
      <span className="brand-mark" role="img" aria-label="AC3D" />
      <span className="admin-brand-title"><strong>AC3D</strong></span>
    </Link>
  );

  function renderLink(link: NavLink, onNavigate?: () => void) {
    const href = hrefFor(link);
    if (!href) return null;
    const Icon = link.icon;
    const badge = badges?.[link.id];
    return (
      <Link key={link.id} className={isActive(link) ? "active" : undefined} href={href} onClick={onNavigate} aria-current={isActive(link) ? "page" : undefined}>
        <Icon className="nav-icon" />
        <span>{link.label}</span>
        {badge ? <b>{badge}</b> : null}
      </Link>
    );
  }

  function renderGroups(onNavigate?: () => void) {
    return (
      <>
        {hrefFor(home) ? <div className="nav-group">{renderLink(home, onNavigate)}</div> : null}
        {visibleGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.links.map((link) => renderLink(link, onNavigate))}
          </div>
        ))}
      </>
    );
  }

  const newQuote = canUseOrcamentos ? (
    <Link className="new-order-cta" href="/orcamentos" onClick={() => setMoreOpen(false)}>
      <IconCirclePlus className="nav-icon" /> Novo orçamento
    </Link>
  ) : null;

  const logoutButton = (
    <button className="logout-button" onClick={logout} aria-label="Sair" title={email ? `Sair (${email})` : "Sair"}><IconLogout className="nav-icon" /></button>
  );

  if (status === "checking") {
    // Reserva o lugar da barra lateral enquanto confere a sessão — sem isso o
    // conteúdo "pulava" pro lado a cada troca de tela quando o menu aparecia.
    return (
      <>
        <aside className="app-sidebar" aria-hidden="true">{brand}</aside>
        <header className="app-mobilebar">{brand}</header>
      </>
    );
  }
  if (status !== "authenticated") {
    // Sem sessão (tela de login): só a marca, sem menu.
    return <header className="app-mobilebar app-bare">{brand}</header>;
  }

  return (
    <>
      {/* Computador: barra lateral fixa */}
      <aside className="app-sidebar" aria-label="Menu principal">
        {brand}
        {newQuote}
        <nav className="app-nav">{renderGroups()}</nav>
        <div className="app-sidebar-footer">
          {visibleAccount.length ? <nav className="app-nav"><div className="nav-group">{visibleAccount.map((link) => renderLink(link))}</div></nav> : null}
          <div className="admin-account">
            <span className="admin-account-email" title={email ?? ""}>{email ?? ""}</span>
            <ThemeToggle />
            {logoutButton}
          </div>
        </div>
      </aside>

      {/* Celular: barra superior compacta + abas embaixo */}
      <header className="app-mobilebar">
        {brand}
        <div className="admin-account">
          <ThemeToggle />
          {logoutButton}
        </div>
      </header>
      <nav className="app-tabbar" aria-label="Menu principal">
        {tabs.map((link) => renderLink(link))}
        <button type="button" className={moreHasActive ? "active" : undefined} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
          <IconMenu className="nav-icon" />
          <span>Mais</span>
        </button>
      </nav>
      {moreOpen ? (
        <div className="app-more" role="dialog" aria-modal="true" aria-label="Todas as telas">
          <button className="app-more-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMoreOpen(false)} />
          <div className="app-more-sheet">
            <div className="app-more-head">
              <strong>Menu</strong>
              <button type="button" className="theme-toggle" onClick={() => setMoreOpen(false)} aria-label="Fechar menu"><IconX className="nav-icon" /></button>
            </div>
            {newQuote}
            <nav className="app-nav">
              {renderGroups(() => setMoreOpen(false))}
              {visibleAccount.length ? (
                <div className="nav-group">
                  <span className="nav-group-label">Conta</span>
                  {visibleAccount.map((link) => renderLink(link, () => setMoreOpen(false)))}
                </div>
              ) : null}
            </nav>
            {email ? <p className="app-more-email">{email}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
