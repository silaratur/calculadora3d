/**
 * Perfis de acesso e quais páginas cada um pode abrir. Usado no proxy (edge,
 * decide a partir do JWT), no AdminHeader (filtra o menu) e na API de
 * usuários (valida o valor de `role`) — um só lugar de verdade para os três.
 *
 * Um usuário pode ter mais de um perfil ao mesmo tempo (ex: Gerador de
 * Catálogo + Vendas) — armazenado como string separada por vírgula (ex:
 * "CATALOG,SALES"). ADMIN e VIEWER são exclusivos: nunca combinam com mais
 * nada, nem entre si (ver `rolesAreValid`).
 */

export type Role = "ADMIN" | "CATALOG" | "CALCULATOR" | "PRODUCTION" | "SALES" | "FINANCE" | "VIEWER";

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "ADMIN", label: "Administrador", description: "Acesso completo a todas as áreas, incluindo gestão de usuários. Não combina com outros perfis." },
  { value: "CATALOG", label: "Gerador de Catálogo", description: "Só acessa o Catálogo." },
  { value: "CALCULATOR", label: "Gerador de Calculadora", description: "Só acessa a Calculadora e Orçamentos." },
  { value: "PRODUCTION", label: "Operador de Produção", description: "Só acessa a fila de Produção — sem dados financeiros ou de clientes." },
  { value: "SALES", label: "Vendas/Atendimento", description: "Clientes, Vendas (com recebimentos), Projetos, Calculadora e Orçamentos." },
  { value: "FINANCE", label: "Financeiro", description: "Custos, Caixa, Vendas (com recebimentos, então também edita venda ali) e a lista de Orçamentos, só para consulta." },
  { value: "VIEWER", label: "Leitura", description: "Só o Painel, sem poder editar nada — pra acompanhar sem risco. Não combina com outros perfis." },
];

const ROLE_VALUES = ROLE_OPTIONS.map((item) => item.value);

// ADMIN (acesso total) e VIEWER (só leitura) são opostos extremos — combinar
// qualquer um deles com outro perfil não faz sentido (um já dá tudo, o
// outro trava tudo), diferente dos perfis "de área" (Catálogo, Vendas...)
// que se somam livremente entre si.
export const EXCLUSIVE_ROLES: Role[] = ["ADMIN", "VIEWER"];

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as string[]).includes(value);
}

export function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

/** "CATALOG, SALES" | "CATALOG,SALES" → ["CATALOG","SALES"]; ignora lixo/valores inválidos e duplicados. */
export function parseRoles(raw: string): Role[] {
  const values = raw.split(",").map((item) => item.trim()).filter(isRole);
  return Array.from(new Set(values));
}

export function serializeRoles(roles: Role[]): string {
  return Array.from(new Set(roles)).join(",");
}

/** Rótulos combinados pra exibição (ex: "Gerador de Catálogo, Vendas/Atendimento"). */
export function rolesLabel(raw: string): string {
  const roles = parseRoles(raw);
  return roles.length ? roles.map((role) => roleLabel(role)).join(", ") : raw;
}

/** Ao menos 1 perfil; se tiver ADMIN ou VIEWER, tem que ser o único perfil da lista. */
export function rolesAreValid(roles: Role[]): boolean {
  if (roles.length === 0) return false;
  const hasExclusive = roles.some((role) => EXCLUSIVE_ROLES.includes(role));
  return hasExclusive ? roles.length === 1 : true;
}

// "/" (painel) fica liberado pra qualquer perfil autenticado — é a página de
// pouso logo após o login, sem ela um usuário restrito cairia em loop de
// redirecionamento ao entrar.
const UNIVERSAL_PATHS = ["/"];

const ROLE_ALLOWED_PREFIXES: Record<Exclude<Role, "ADMIN">, string[]> = {
  CATALOG: ["/catalog"],
  // /quotes = orçamento em PDF (/quotes/[id]/print) — quem gera ou consulta
  // orçamento precisa conseguir abrir o PDF dele.
  CALCULATOR: ["/calculator", "/orcamentos", "/quotes"],
  PRODUCTION: ["/production"],
  SALES: ["/customers", "/sales", "/projects", "/calculator", "/orcamentos", "/quotes"],
  // Recebimentos viraram uma ação dentro do card do pedido em Vendas (não uma
  // tela própria) — dar Financeiro sem Vendas deixaria sem como registrar um
  // recebimento; a contrapartida é que esse perfil também edita pedidos.
  // Também vê a lista de orçamentos (em aberto = receita potencial), sem editar.
  FINANCE: ["/costs", "/cashflow", "/sales", "/projects", "/quotes"],
  VIEWER: [],
};

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Se este conjunto de perfis (string bruta, ex: "CATALOG,SALES") pode abrir
 * esta página. ADMIN em qualquer combinação (na prática, sempre sozinho)
 * sempre pode; o acesso de quem tem vários perfis é a união do que cada um
 * libera.
 */
export function canAccessPath(rawRoles: string, pathname: string): boolean {
  const roles = parseRoles(rawRoles);
  if (roles.includes("ADMIN")) return true;
  if (UNIVERSAL_PATHS.some((path) => matchesPrefix(pathname, path))) return true;
  return roles.some((role) => role !== "ADMIN" && ROLE_ALLOWED_PREFIXES[role].some((prefix) => matchesPrefix(pathname, prefix)));
}
