/**
 * Perfis de acesso e quais páginas cada um pode abrir. Usado no proxy (edge,
 * decide a partir do JWT), no AdminHeader (filtra o menu) e na API de
 * usuários (valida o valor de `role`) — um só lugar de verdade para os três.
 */

export type Role = "ADMIN" | "CATALOG" | "CALCULATOR" | "PRODUCTION" | "SALES" | "FINANCE" | "VIEWER";

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "ADMIN", label: "Administrador", description: "Acesso completo a todas as áreas, incluindo gestão de usuários." },
  { value: "CATALOG", label: "Gerador de Catálogo", description: "Só acessa Catálogo e Catálogo Novo." },
  { value: "CALCULATOR", label: "Gerador de Calculadora", description: "Só acessa a Calculadora." },
  { value: "PRODUCTION", label: "Operador de Produção", description: "Só acessa a fila de Produção — sem dados financeiros ou de clientes." },
  { value: "SALES", label: "Vendas/Atendimento", description: "Clientes, Vendas (com recebimentos), Projetos e Calculadora." },
  { value: "FINANCE", label: "Financeiro", description: "Custos, Caixa e Vendas (a tela de recebimentos fica dentro de Vendas, então também dá pra editar pedido ali)." },
  { value: "VIEWER", label: "Leitura", description: "Só o Painel, sem poder editar nada — pra acompanhar sem risco." },
];

const ROLE_VALUES = ROLE_OPTIONS.map((item) => item.value);

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as string[]).includes(value);
}

export function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

// "/" (painel) fica liberado pra qualquer perfil autenticado — é a página de
// pouso logo após o login, sem ela um usuário restrito cairia em loop de
// redirecionamento ao entrar.
const UNIVERSAL_PATHS = ["/"];

const ROLE_ALLOWED_PREFIXES: Record<Exclude<Role, "ADMIN">, string[]> = {
  CATALOG: ["/catalog", "/catalog-new"],
  CALCULATOR: ["/calculator"],
  PRODUCTION: ["/production"],
  SALES: ["/customers", "/sales", "/projects", "/calculator"],
  // Recebimentos viraram uma ação dentro do card do pedido em Vendas (não uma
  // tela própria) — dar Financeiro sem Vendas deixaria sem como registrar um
  // recebimento; a contrapartida é que esse perfil também edita pedidos.
  FINANCE: ["/costs", "/cashflow", "/sales"],
  VIEWER: [],
};

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Se este perfil pode abrir esta página. ADMIN sempre pode; perfis desconhecidos caem no mais restrito (só o Painel). */
export function canAccessPath(role: string, pathname: string): boolean {
  if (role === "ADMIN") return true;
  if (UNIVERSAL_PATHS.some((path) => matchesPrefix(pathname, path))) return true;
  if (!isRole(role) || role === "ADMIN") return false;
  return ROLE_ALLOWED_PREFIXES[role].some((prefix) => matchesPrefix(pathname, prefix));
}
