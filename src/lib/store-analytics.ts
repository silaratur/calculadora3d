// Loja → Campanhas: tipos de evento da medição própria e calendário comercial.

export const EVENT_TYPES = ["page_view", "view_item", "add_to_cart", "begin_checkout", "generate_lead", "select_promotion", "search"] as const;
export type StoreEventType = (typeof EVENT_TYPES)[number];

/** Rótulo de onde veio a ação, para as tabelas do painel. */
export function campaignLabel(key: string, names: { collections: Map<string, string>; banners: Map<string, string> }) {
  if (key === "destaque") return "Em destaque";
  if (key === "lancamentos") return "Lançamentos";
  if (key === "categoria") return "Prateleiras por categoria";
  if (key === "busca") return "Busca";
  if (key === "link") return "Link direto da peça";
  if (key === "abertura") return "Fotos da abertura";
  if (key.startsWith("colecao:")) return `Coleção: ${names.collections.get(key.slice(8)) ?? "excluída"}`;
  if (key.startsWith("banner:")) return `Banner: ${names.banners.get(key.slice(7)) ?? "excluído"}`;
  if (key.startsWith("data:")) return `Vitrine automática: ${key.slice(5).replace(/-/g, " ")}`;
  return key;
}

const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);
const nthSunday = (year: number, month: number, n: number) => {
  const first = at(year, month, 1);
  return at(year, month, 1 + ((7 - first.getDay()) % 7) + (n - 1) * 7);
};

/** Datas comerciais entre `from` e `to` (marcadores do calendário). */
export function commercialDates(from: Date, to: Date) {
  const list: { date: Date; label: string }[] = [];
  for (let year = from.getFullYear(); year <= to.getFullYear(); year += 1) {
    const november1 = at(year, 11, 1);
    list.push(
      { date: nthSunday(year, 5, 2), label: "Dia das Mães" },
      { date: at(year, 6, 12), label: "Dia dos Namorados" },
      { date: nthSunday(year, 8, 2), label: "Dia dos Pais" },
      { date: at(year, 10, 12), label: "Dia das Crianças" },
      { date: at(year, 10, 15), label: "Dia dos Professores" },
      { date: at(year, 11, 1 + ((5 - november1.getDay() + 7) % 7) + 21), label: "Black Friday" },
      { date: at(year, 12, 25), label: "Natal" },
    );
  }
  return list.filter((item) => item.date >= from && item.date <= to).sort((a, b) => a.date.getTime() - b.date.getTime());
}
