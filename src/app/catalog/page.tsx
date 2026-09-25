"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconClock, IconSave, IconShieldAlert, IconShoppingBag, IconTag, IconTrash, IconX } from "@/components/Icons";
import { calculateMultiMaterialCost, calculatePieceCost, calculateSuggestedPrice, effectiveMonthlyFixedCost, fixedCostPerPiece, markupPercentForFinalPrice, type PricingMethod } from "@/lib/costing";
import { resizeImage } from "@/lib/image";

type Material = { id: string; name: string; type: string; unitPrice: number; unitWeightGrams: number; costPerKg: number };
type MaterialLine = { materialId: string; grams: number };
// No formulário o peso fica como texto (não número) igual ao resto do app —
// se o valor ligado ao <input> for number, digitar "64,9" perde a vírgula no
// meio da digitação porque o value volta arredondado a cada tecla.
type DraftMaterialLine = { materialId: string; grams: string };
type Printer = { id: string; model: string; purchasePrice: number; powerWatts: number; usefulLifeHours: number; maintenancePerHour: number };
type PricingSettings = { energyRate: number; defaultPowerWatts: number; laborRate: number; defaultMarkup: number; defaultLossRate: number; monthlyRent: number; monthlySubscriptions: number; monthlyMaintenance: number; monthlyOtherCosts: number; monthlyPieces: number };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };
const defaultMarketplace: Marketplace = { id: "direct", name: "Venda Direta", commissionRate: 0, fixedFee: 0, adsRate: 0 };
const markupPresets = ["10", "25", "50", "65", "100", "150", "200"];
const legendColors = ["#602f32", "#777f5d", "#8a4a4e", "#d1a94a", "#f4bbd3", "#e8ddd7"];
type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  description?: string;
  imageUrl: string;
  weightGrams: number;
  printTimeHours: number;
  prepMinutes: number;
  cleanupMinutes: number;
  printerId: string | null;
  printer?: Printer | null;
  materialCost: number;
  laborCost: number;
  energyCost: number;
  machineCost: number;
  overheadCost: number;
  cost: number;
  price: number;
  profitMargin: number;
  lossRatePercent: number;
  pricingMethod: PricingMethod;
  discountPerUnit: number;
  marketplaceChannelId: string | null;
  active: boolean;
  materials: MaterialLine[];
  salesCount: number;
  createdAt: string;
};

type Draft = {
  name: string;
  category: string;
  description: string;
  imageUrl: string;
  materialLines: DraftMaterialLine[];
  hours: string;
  minutes: string;
  prep: string;
  cleanup: string;
  printerId: string;
  markup: string;
  pricingMethod: PricingMethod;
  lossRate: string;
  marketplaceId: string;
  discount: string;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  category: "",
  description: "",
  imageUrl: "",
  materialLines: [],
  hours: "0",
  minutes: "0",
  prep: "0",
  cleanup: "0",
  printerId: "",
  markup: "40",
  pricingMethod: "markup",
  lossRate: "0",
  marketplaceId: "direct",
  discount: "0",
  active: true,
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;

// Direção que cada critério assume ao ser selecionado pela primeira vez —
// o que faz sentido como "padrão" varia (recente = mais novo primeiro,
// categoria = A-Z, vendas/preço = mais vendido/mais barato primeiro).
const defaultSortDirection: Record<"name" | "recent" | "category" | "sales" | "price", "asc" | "desc"> = {
  name: "asc",
  recent: "desc",
  category: "asc",
  sales: "desc",
  price: "asc",
};

// Paleta fixa (cores da marca + tons próximos) — cada categoria sempre cai na
// mesma cor, pra dar pra reconhecer categoria pela tarja sem ler o texto.
// Preenchido sólido de propósito: sobre foto de produto (fundo branco/claro
// na maioria das vezes) a tarja quase-branca de antes ficava invisível.
const categoryColors = ["#602f32", "#777f5d", "#a3402a", "#8a5a2e", "#4c6b7a", "#8a4a4e", "#5f6549", "#a3743a"];
// FNV-1a — espalha melhor que um hash ingênuo (soma/produto simples colidia
// justamente nas categorias reais do catálogo: "NATAL" e "Organização" caindo
// na mesma cor).
function normalizeCategory(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function categoryColor(category: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < category.length; i += 1) {
    hash ^= category.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return categoryColors[(hash >>> 0) % categoryColors.length];
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([defaultMarketplace]);
  const [settings, setSettings] = useState<PricingSettings>({ energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, defaultMarkup: 40, defaultLossRate: 5, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60 });
  const [currentMonthFixedCost, setCurrentMonthFixedCost] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "form">("list");
  const [search, setSearch] = useState("");
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "recent" | "category" | "sales" | "price">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [imageError, setImageError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      // no-store: editar um produto tem que carregar o custo/lossRatePercent
      // atuais dele, não uma cópia em memória de quando a página abriu — foi
      // exatamente essa mesma causa que deixava o preço desatualizado em
      // Orçamentos.
      const [productRes, materialRes, printerRes, settingsRes, marketplaceRes, fixedRes] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/materials", { cache: "no-store" }),
        fetch("/api/printers", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/marketplaces"),
        fetch("/api/costs/fixed"),
      ]);
      if (productRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (productRes.ok) setProducts((await productRes.json()) as Product[]);
      if (materialRes.ok) setMaterials((await materialRes.json()) as Material[]);
      if (printerRes.ok) setPrinters((await printerRes.json()) as Printer[]);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as PricingSettings);
      // "Venda Direta" (0% de taxas) fica sempre disponível, igual na Calculadora.
      if (marketplaceRes.ok) { const data = (await marketplaceRes.json()) as Marketplace[]; setMarketplaces([defaultMarketplace, ...data]); }
      if (fixedRes.ok) {
        const data = (await fixedRes.json()) as { month: string; total: number }[];
        setCurrentMonthFixedCost(effectiveMonthlyFixedCost(data, month));
      }
    }
    void load();

    function onFocus() {
      if (document.visibilityState === "visible") void load();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reloadToken]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((product) => product.category)))], [products]);
  const existingCategories = useMemo(() => Array.from(new Set(products.map((product) => product.category))).sort(), [products]);
  // Campo vazio mostra todas as categorias; digitando, filtra ignorando
  // maiúsculas e acentos ("decor" acha "Decoração").
  const categorySuggestions = useMemo(() => {
    const query = normalizeCategory(draft.category);
    if (!query) return existingCategories;
    return existingCategories.filter((item) => normalizeCategory(item).includes(query) && item !== draft.category.trim());
  }, [draft.category, existingCategories]);
  const filtered = useMemo(() => {
    const items = products.filter(
      (product) =>
        `${product.sku} ${product.name}`.toLowerCase().includes(search.toLowerCase()) &&
        (category === "all" || product.category === category),
    );
    const sorted = [...items];
    const sign = sortDirection === "asc" ? 1 : -1;
    if (sortBy === "name") sorted.sort((a, b) => sign * a.name.localeCompare(b.name));
    else if (sortBy === "recent") sorted.sort((a, b) => sign * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    else if (sortBy === "category") sorted.sort((a, b) => sign * (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
    else if (sortBy === "sales") sorted.sort((a, b) => sign * (a.salesCount - b.salesCount));
    else if (sortBy === "price") sorted.sort((a, b) => sign * (a.price - b.price));
    return sorted;
  }, [category, sortDirection, products, search, sortBy]);
  // Sugestões abaixo do campo de busca: com o campo vazio mostra os produtos
  // (lista aberta), digitando estreita pelas ocorrências no SKU/nome — mesmo
  // padrão do autocomplete de cliente em Orçamentos.
  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = products.filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(query));
    return [...matches].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
  }, [products, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const materialLinesWithData = draft.materialLines
    .map((line) => ({ line, material: materials.find((item) => item.id === line.materialId) }))
    .filter((entry): entry is { line: DraftMaterialLine; material: Material } => Boolean(entry.material));
  const materialCost = calculateMultiMaterialCost(materialLinesWithData.map((entry) => ({ grams: n(entry.line.grams), material: entry.material })));
  const totalWeightGrams = materialLinesWithData.reduce((sum, entry) => sum + n(entry.line.grams), 0);
  const printTimeHours = n(draft.hours) + n(draft.minutes) / 60;
  const printer = printers.find((item) => item.id === draft.printerId);
  const marketplace = marketplaces.find((item) => item.id === draft.marketplaceId) ?? marketplaces[0] ?? defaultMarketplace;
  const quickChannels = marketplaces.slice(0, 4);

  const cost = useMemo(
    () =>
      calculatePieceCost({
        weightGrams: totalWeightGrams,
        materialUnitPrice: 0,
        materialUnitWeightGrams: 1000,
        filamentCostOverride: materialCost,
        printTimeHours,
        prepMinutes: n(draft.prep),
        cleanupMinutes: n(draft.cleanup),
        laborRatePerHour: settings.laborRate,
        energyRatePerKwh: settings.energyRate,
        powerWatts: printer?.powerWatts ?? 0,
        printerPurchasePrice: printer?.purchasePrice,
        printerUsefulLifeHours: printer?.usefulLifeHours,
        printerMaintenancePerHour: printer?.maintenancePerHour,
        fixedCostPerPiece: fixedCostPerPiece(settings, currentMonthFixedCost ?? undefined),
        lossRatePercent: n(draft.lossRate),
      }),
    [materialCost, totalWeightGrams, printTimeHours, draft.prep, draft.cleanup, draft.lossRate, settings, printer, currentMonthFixedCost],
  );
  const pricing = calculateSuggestedPrice({
    unitCost: cost.total,
    markupPercent: n(draft.markup),
    channel: marketplace,
    discountPerUnit: n(draft.discount),
    method: draft.pricingMethod,
  });
  const suggestedPrice = pricing.final;
  const costSegments = [
    { label: "Filamento", value: cost.filament, color: legendColors[0] },
    { label: "Depreciação", value: cost.machine, color: legendColors[1] },
    { label: "Mão de Obra", value: cost.labor, color: legendColors[2] },
    { label: "Energia", value: cost.energy, color: legendColors[3] },
    { label: "Custos Fixos Rateados", value: cost.fixedCosts, color: legendColors[4] },
    { label: "Reserva Perdas", value: cost.reserve, color: legendColors[5] },
  ];
  const costSegmentsTotal = costSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const profit = suggestedPrice - cost.total;
  const realMarginPercent = suggestedPrice ? (profit / suggestedPrice) * 100 : 0;
  // draft.markup guarda casas decimais extras (pra reproduzir exatamente o
  // preço digitado em "Preço Final Sugerido") — só arredonda pra exibir.
  const markupDisplay = Math.round(n(draft.markup));

  function bumpMarkup(delta: number) {
    setDraft({ ...draft, markup: String(Math.min(200, Math.max(0, n(draft.markup) + delta))) });
  }

  // Caminho inverso: usuário digita o preço final que quer testar, a gente
  // acha o markup/margem que chega nele — ajuda a explorar oportunidades de
  // precificação sem fazer a conta na mão. O preço digitado é o mandante:
  // precisão de 4 casas no % evita que o preço volte arredondado (1 casa já
  // deriva alguns centavos de diferença em preços mais altos).
  function applyFinalPrice(value: string) {
    const target = n(value);
    if (!target || !cost.total) return;
    const percent = markupPercentForFinalPrice({
      unitCost: cost.total,
      finalPrice: target,
      channel: marketplace,
      discountPerUnit: n(draft.discount),
      method: draft.pricingMethod,
    });
    setDraft((current) => ({ ...current, markup: String(Math.round(percent * 10000) / 10000) }));
  }

  function addMaterialLine() {
    if (!materials.length) return;
    const usedIds = new Set(draft.materialLines.map((line) => line.materialId));
    // Sugere sempre um material ainda não usado nessa peça — se todos já
    // estiverem em uso, cai no primeiro (o <select> de cada linha impede
    // duas linhas ficarem com o mesmo material de qualquer forma).
    const next = materials.find((item) => !usedIds.has(item.id)) ?? materials[0];
    setDraft({ ...draft, materialLines: [...draft.materialLines, { materialId: next.id, grams: "" }] });
  }
  function updateMaterialLine(index: number, patch: Partial<DraftMaterialLine>) {
    setDraft({ ...draft, materialLines: draft.materialLines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }
  function removeMaterialLine(index: number) {
    setDraft({ ...draft, materialLines: draft.materialLines.filter((_, i) => i !== index) });
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError("");
    try {
      setDraft({ ...draft, imageUrl: await resizeImage(file) });
    } catch {
      setImageError("Não foi possível processar essa imagem. Tente outro arquivo.");
    }
  }

  function sortArrow(value: "name" | "recent" | "category" | "sales" | "price") {
    if (sortBy !== value) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function selectSort(value: "name" | "recent" | "category" | "sales" | "price") {
    // Clicar de novo no mesmo filtro já selecionado inverte a direção
    // (crescente ↔ decrescente); trocar de filtro usa o padrão de cada um
    // (A-Z, mais recente primeiro, A-Z, mais vendido primeiro, mais barato primeiro).
    if (value === sortBy) { setSortDirection((current) => (current === "asc" ? "desc" : "asc")); }
    else { setSortBy(value); setSortDirection(defaultSortDirection[value]); }
    setPage(1);
  }

  function newProduct() {
    setEditingId(null);
    // A1 é a impressora mais usada — poupa um clique em quase todo produto
    // novo; quem usar outra ainda troca livremente no seletor.
    const defaultPrinter = printers.find((item) => item.model.toLowerCase().includes("a1"));
    setDraft({ ...emptyDraft, printerId: defaultPrinter?.id ?? "" });
    setFeedback("");
    setView("form");
  }

  function edit(product: Product) {
    setEditingId(product.id);
    setDraft({
      name: product.name,
      category: product.category,
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
      materialLines: product.materials?.map((line) => ({ materialId: line.materialId, grams: String(line.grams).replace(".", ",") })) ?? [],
      hours: String(Math.floor(product.printTimeHours)),
      minutes: String(Math.round((product.printTimeHours % 1) * 60)),
      prep: String(product.prepMinutes),
      cleanup: String(product.cleanupMinutes),
      printerId: product.printerId ?? "",
      markup: String(product.profitMargin),
      pricingMethod: product.pricingMethod ?? "markup",
      lossRate: String(product.lossRatePercent ?? 0),
      marketplaceId: product.marketplaceChannelId ?? "direct",
      discount: String(product.discountPerUnit ?? 0),
      active: product.active,
    });
    setFeedback("");
    setView("form");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    // Só cria categoria nova se não existir nenhuma equivalente — "natal" ou
    // "Decoracao" reaproveitam "NATAL"/"Decoração" em vez de duplicar.
    const typedCategory = draft.category.trim();
    const category = existingCategories.find((item) => normalizeCategory(item) === normalizeCategory(typedCategory)) ?? typedCategory;
    const payload = {
      name: draft.name,
      category,
      description: draft.description,
      imageUrl: draft.imageUrl,
      weightGrams: totalWeightGrams,
      printTimeHours,
      prepMinutes: n(draft.prep),
      cleanupMinutes: n(draft.cleanup),
      printerId: draft.printerId || null,
      materials: draft.materialLines.filter((line) => n(line.grams) > 0).map((line) => ({ materialId: line.materialId, grams: n(line.grams) })),
      materialCost: cost.filament,
      laborCost: cost.labor,
      energyCost: cost.energy,
      machineCost: cost.machine,
      overheadCost: cost.fixedCosts,
      profitMargin: n(draft.markup),
      lossRatePercent: n(draft.lossRate),
      pricingMethod: draft.pricingMethod,
      discountPerUnit: n(draft.discount),
      marketplaceChannelId: draft.marketplaceId === "direct" ? null : draft.marketplaceId,
      active: draft.active,
      cost: cost.total,
      price: suggestedPrice,
    };
    const response = await fetch(editingId ? `/api/products?id=${encodeURIComponent(editingId)}` : "/api/products", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { setFeedback("Não foi possível salvar o produto. Verifique o login e os campos."); return; }
    setDraft(emptyDraft);
    setEditingId(null);
    setView("list");
    reload();
  }

  async function archive(id: string) {
    if (!window.confirm("Desativar este produto? O histórico será preservado.")) return;
    await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  }

  return (
    <main className="calculator-shell">
      <AdminHeader active="catalog" badges={{ catalog: products.length }} />
      <div className="calculator-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e cadastrar produtos do catálogo." /> : null}

        {view === "list" ? (
          <>
            <section className="library-heading">
              <div>
                <h1>Catálogo</h1>
                <p>Cadastro, precificação e fotos dos seus produtos.</p>
              </div>
              <div className="project-tools">
                <div className="client-name-wrap">
                  <input
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    onFocus={() => setSearchSuggestionsOpen(true)}
                    onBlur={() => setSearchSuggestionsOpen(false)}
                    placeholder="Buscar SKU ou produto..."
                    autoComplete="off"
                  />
                  {searchSuggestionsOpen && searchSuggestions.length > 0 ? (
                    <ul className="client-suggestions">
                      {searchSuggestions.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSearch(product.name);
                              setSearchSuggestionsOpen(false);
                              setPage(1);
                              (document.activeElement as HTMLElement | null)?.blur();
                            }}
                          >
                            {product.sku} · {product.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button type="button" className="new-quote-button" onClick={newProduct}>＋ Novo produto</button>
              </div>
            </section>

            <div className="catalog-filters">
              <strong>{filtered.length} produtos</strong>
              <div className="catalog-sort">
                <span>Classificar por</span>
                <button type="button" className={sortBy === "name" ? "chip selected" : "chip"} onClick={() => selectSort("name")}>Nome{sortArrow("name")}</button>
                <button type="button" className={sortBy === "recent" ? "chip selected" : "chip"} onClick={() => selectSort("recent")}>Mais Recentes{sortArrow("recent")}</button>
                <button type="button" className={sortBy === "category" ? "chip selected" : "chip"} onClick={() => selectSort("category")}>Categoria{sortArrow("category")}</button>
                <button type="button" className={sortBy === "sales" ? "chip selected" : "chip"} onClick={() => selectSort("sales")}>Mais Vendas{sortArrow("sales")}</button>
                <button type="button" className={sortBy === "price" ? "chip selected" : "chip"} onClick={() => selectSort("price")}>Preço{sortArrow("price")}</button>
              </div>
              <div className="catalog-filters-right">
                <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                  {categories.map((item) => <option key={item} value={item}>{item === "all" ? "Todas as categorias" : item}</option>)}
                </select>
                <label className="items-per-page">Por página
                  <select value={itemsPerPage} onChange={(event) => { setItemsPerPage(Number(event.target.value)); setPage(1); }}>
                    {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="product-grid product-grid-compact">
              {paginated.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-card-photo">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso
                      <img src={product.imageUrl} alt={product.name} />
                    ) : (
                      <span className="product-card-photo-placeholder">{product.name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="product-card-category" style={{ background: categoryColor(product.category) }}>{product.category}</span>
                    <span className="product-card-photo-actions">
                      <button className="edit-button" onClick={() => edit(product)}>Editar</button>
                      <button className="delete-button" onClick={() => archive(product.id)} aria-label={`Excluir ${product.name}`}><IconTrash className="nav-icon" /></button>
                    </span>
                  </div>
                  <span className="material-badge">{product.sku}</span>
                  <h2>{product.name}</h2>
                  <div className="product-card-prices">
                    <div><span>Custo</span><strong>{brl(product.cost)}</strong></div>
                    <div><span>Preço</span><strong className="price-highlight">{brl(product.price)}</strong></div>
                  </div>
                  <div className="product-card-stats">
                    <span><IconClock className="nav-icon" /> {product.printTimeHours.toFixed(1)}h impressão</span>
                    <span><IconTag className="nav-icon" /> {product.salesCount} vendido{product.salesCount === 1 ? "" : "s"}</span>
                  </div>
                </article>
              ))}
            </div>
            {filtered.length === 0 ? <div className="empty-note">Nenhum produto encontrado ainda. Clique em “＋ Novo produto”.</div> : null}
            <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          </>
        ) : (
          <form onSubmit={save}>
            <div className="catalog-new-formbar">
              <button type="button" className="quiet-button" onClick={() => setView("list")}>← Voltar para produtos</button>
              <p className="sku-hint">
                {editingId
                  ? <>Editando SKU <strong>{products.find((item) => item.id === editingId)?.sku}</strong> — fixo, não muda.</>
                  : "O SKU é gerado automaticamente a partir da categoria (ex: Decoração → D.001, Natal → N.001)."}
              </p>
            </div>

            <div className="calculator-grid">
              <div className="calculator-main">
                <section className="calc-section">
                  <Title text="INFORMAÇÕES DO PRODUTO" />
                  <div className="field-grid two">
                    <label>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Porta Guardanapos" /></label>
                    <label className="client-field">
                      Categoria
                      <input
                        required
                        value={draft.category}
                        onChange={(event) => { setDraft({ ...draft, category: event.target.value }); setCategorySuggestionsOpen(true); }}
                        onFocus={() => setCategorySuggestionsOpen(true)}
                        onBlur={() => setCategorySuggestionsOpen(false)}
                        placeholder="Ex: Decoração, Natal..."
                        autoComplete="off"
                      />
                      {categorySuggestionsOpen && categorySuggestions.length > 0 ? (
                        <ul className="client-suggestions">
                          {categorySuggestions.map((item) => (
                            <li key={item}>
                              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraft({ ...draft, category: item }); setCategorySuggestionsOpen(false); }}>
                                {item}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </label>
                  </div>
                  <label className="notes-field">Descrição<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Aparece no card do catálogo" /></label>
                  <div className="field-grid two">
                    <label>Foto do produto<input type="file" accept="image/*" onChange={handleImage} /></label>
                    {draft.imageUrl ? (
                      <div className="image-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                        <img src={draft.imageUrl} alt="Prévia do produto" />
                        <button type="button" className="secondary-button" onClick={() => setDraft({ ...draft, imageUrl: "" })}>Remover foto</button>
                      </div>
                    ) : null}
                  </div>
                  {imageError ? <p className="admin-feedback">{imageError}</p> : null}
                </section>

                <section className="calc-section">
                  <Title text="MATERIAL & FILAMENTO" />
                  <div className="material-lines">
                    <span className="material-lines-label">Um material por linha — some quantos filamentos o AMS usar nessa peça</span>
                    {draft.materialLines.length ? (
                      <div className="material-line material-line-header">
                        <span>Filamento (da Biblioteca)</span>
                        <span>Peso da peça (g)</span>
                        <span />
                      </div>
                    ) : null}
                    {draft.materialLines.map((line, index) => (
                      <div className="material-line" key={index}>
                        <select value={line.materialId} onChange={(event) => updateMaterialLine(index, { materialId: event.target.value })}>
                          {materials
                            // Um material só pode estar em uma linha por vez — sem isso,
                            // duas linhas com o mesmo filamento derrubavam o salvamento.
                            .filter((item) => item.id === line.materialId || !draft.materialLines.some((other, otherIndex) => otherIndex !== index && other.materialId === item.id))
                            .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        {/* Texto (não number) e vírgula aceita — mantém "64,9" enquanto
                            digita, sem arredondar a cada tecla (n() só converte ao calcular/salvar). */}
                        <input inputMode="decimal" value={line.grams} onChange={(event) => updateMaterialLine(index, { grams: event.target.value })} placeholder="Ex: 64,9" />
                        <button type="button" className="delete-button" onClick={() => removeMaterialLine(index)} aria-label="Remover material"><IconTrash className="nav-icon" /></button>
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={addMaterialLine} disabled={!materials.length || draft.materialLines.length >= materials.length}>+ Adicionar material</button>
                    {!materials.length ? <p className="admin-feedback">Cadastre filamentos na Biblioteca para selecioná-los aqui.</p> : null}
                  </div>
                </section>

                <section className="calc-section">
                  <Title text="TEMPO DE PRODUÇÃO (PEÇA INTEIRA)" />
                  <div className="field-grid three">
                    <label>Horas de impressão<input inputMode="numeric" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} /></label>
                    <label>Minutos de impressão<input inputMode="numeric" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} /></label>
                    <div className="metric-box">
                      <span>Tempo total</span>
                      <strong>{printTimeHours.toFixed(2)}h</strong>
                    </div>
                  </div>
                  <div className="field-grid three">
                    <label>Fatiamento / Prep (min)<input inputMode="numeric" value={draft.prep} onChange={(event) => setDraft({ ...draft, prep: event.target.value })} /></label>
                    <label>Limpeza / Pós-proc (min)<input inputMode="numeric" value={draft.cleanup} onChange={(event) => setDraft({ ...draft, cleanup: event.target.value })} /></label>
                    <label className="label-hint-row">
                      <span><span className="label-icon-text"><IconShieldAlert className="nav-icon" /> Refugo / % Perdas</span><em>Sugestão: 5%</em></span>
                      <input inputMode="decimal" value={draft.lossRate} onChange={(event) => setDraft({ ...draft, lossRate: event.target.value })} />
                      <small>Reserva para peças com falhas ou testes</small>
                    </label>
                  </div>
                  <small>Um kit de vários itens impressos separadamente? Some o tempo total de todas as peças aqui — é o tempo de máquina que esse produto consome por unidade vendida.</small>
                </section>

                <section className="calc-section">
                  <Title text="IMPRESSORA" />
                  <label>Selecionar da Biblioteca<select value={draft.printerId} onChange={(event) => setDraft({ ...draft, printerId: event.target.value })}><option value="">Sem impressora (sem depreciação de máquina)</option>{printers.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></label>
                  <small>Depreciação, manutenção e consumo de energia dessa impressora entram automaticamente no custo — não precisa digitar nada.</small>
                </section>

                <section className="calc-section">
                  <Title text="MARGEM DE LUCRO & TAXAS" />
                  <div className="margin-panel">
                    <div className="margin-panel-head"><span>MARGEM DE LUCRO DESEJADA</span><span className="margin-method-badge">{draft.pricingMethod === "markup" ? "Markup" : "Margem Real"}</span></div>
                    <div className="margin-panel-value"><strong>{markupDisplay}%</strong></div>
                    <input type="range" min="0" max="200" value={draft.markup} onChange={(event) => setDraft({ ...draft, markup: event.target.value })} />
                    <div className="range-presets">
                      {markupPresets.map((value) => <button type="button" key={value} onClick={() => setDraft({ ...draft, markup: value })}>{value}%</button>)}
                      <span className="range-stepper">
                        <button type="button" onClick={() => bumpMarkup(-5)} aria-label="Diminuir 5%">−5%</button>
                        <button type="button" onClick={() => bumpMarkup(5)} aria-label="Aumentar 5%">+5%</button>
                      </span>
                    </div>
                  </div>
                  <div className="field-grid two pricing-options">
                    <label>
                      Método de Precificação
                      <span className="method-toggle">
                        <button type="button" className={draft.pricingMethod === "markup" ? "selected" : ""} onClick={() => setDraft({ ...draft, pricingMethod: "markup" })}>Markup</button>
                        <button type="button" className={draft.pricingMethod === "margin" ? "selected" : ""} onClick={() => setDraft({ ...draft, pricingMethod: "margin" })}>Margem Real</button>
                      </span>
                      <small>{draft.pricingMethod === "markup" ? "Markup multiplica seu custo total pela %." : "Margem Real garante que o lucro seja essa % do preço final."}</small>
                    </label>
                    <label>
                      <span className="label-icon-text"><IconShoppingBag className="nav-icon" /> Canal de Venda</span>
                      <select value={draft.marketplaceId} onChange={(event) => setDraft({ ...draft, marketplaceId: event.target.value })}>{marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                      <div className="chip-row">{quickChannels.map((item) => <button type="button" key={item.id} className={draft.marketplaceId === item.id ? "chip selected" : "chip"} onClick={() => setDraft({ ...draft, marketplaceId: item.id })}>{item.name} ({(item.commissionRate * 100).toFixed(0)}%)</button>)}</div>
                      <small>Comissão: {(marketplace.commissionRate * 100).toFixed(1)}% · Ads: {(marketplace.adsRate * 100).toFixed(1)}% · Fixa: {brl(marketplace.fixedFee)}</small>
                    </label>
                  </div>
                  <label className="discount-field">Desconto Especial (R$)<input inputMode="decimal" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} /><small>Abatimento aplicado no valor final</small></label>
                </section>
              </div>

              <aside className="price-summary">
                <span className="summary-eyebrow">PREÇO FINAL SUGERIDO</span>
                <div className="price-final-editable">
                  <span>R$</span>
                  <input
                    key={suggestedPrice.toFixed(2)}
                    className="price-final-input"
                    inputMode="decimal"
                    defaultValue={suggestedPrice.toFixed(2).replace(".", ",")}
                    onBlur={(event) => applyFinalPrice(event.target.value)}
                    aria-label="Digitar o preço final e calcular a margem"
                  />
                </div>
                <button className="saved-tag" type="submit"><IconSave className="nav-icon" /> {editingId ? "Atualizar" : "Salvar"}</button>
                <small className="price-final-hint">Digite um preço pra calcular a margem automaticamente</small>
                <hr />
                <div className="summary-title"><span>Composição de Custos</span><strong>Custo Total: {brl(cost.total)}</strong></div>
                <div className="cost-bar">
                  {costSegments.map((segment) => (
                    <i key={segment.label} title={`${segment.label}: ${brl(segment.value)}`} style={{ width: `${(segment.value / costSegmentsTotal) * 100}%`, background: segment.color }} />
                  ))}
                </div>
                <div className="summary-columns">
                  <div>
                    <Cost label="Filamento" value={cost.filament} dot={legendColors[0]} />
                    <Cost label="Depreciação" value={cost.machine} dot={legendColors[1]} />
                    <Cost label="Mão de Obra" value={cost.labor} dot={legendColors[2]} />
                  </div>
                  <div>
                    <Cost label="Energia" value={cost.energy} dot={legendColors[3]} />
                    <Cost label="Custos Fixos" value={cost.fixedCosts} dot={legendColors[4]} />
                    <Cost label="Reserva Perdas" value={cost.reserve} dot={legendColors[5]} />
                  </div>
                </div>
                <div className="summary-card">
                  <Cost label="Filamento" value={cost.filament} />
                  <Cost label="Energia" value={cost.energy} />
                  <Cost label="Depreciação + Manut." value={cost.machine} />
                  <Cost label="Mão de Obra" value={cost.labor} />
                  <Cost label="Custos Fixos Rateados" value={cost.fixedCosts} />
                  <Cost label="Reserva para perdas" value={cost.reserve} />
                  <hr />
                  <Cost label="Custo Base" value={cost.total} bold subtotal />
                </div>
                <div className="summary-card">
                  <Info label="Método de Precificação" value={draft.pricingMethod === "markup" ? "Markup" : "Margem Real"} />
                  <Info label="% Aplicado" value={`${markupDisplay}%`} />
                  <Info label="Canal de Venda" value={marketplace.name} />
                  <Info label="Comissão do Canal" value={`${(marketplace.commissionRate * 100).toFixed(1)}%`} />
                  <Info label="Ads do Canal" value={`${(marketplace.adsRate * 100).toFixed(1)}%`} />
                  <Info label="Taxa Fixa do Canal" value={brl(marketplace.fixedFee)} />
                  {n(draft.discount) > 0 ? <Info label="Desconto Especial" value={brl(n(draft.discount))} /> : null}
                  <hr />
                  <Cost label="Margem de Lucro & Taxas" value={profit} bold subtotal />
                </div>
                <div className="profit-grid">
                  <div><span>LUCRO ESTIMADO</span><strong>+{brl(profit)}</strong><small>{marketplace.name} · Margem Real: {realMarginPercent.toFixed(1)}%</small></div>
                  <div><span>PREÇO ATACADO</span><strong>{brl(suggestedPrice * 0.85)}</strong><small>Desconto por volume</small></div>
                </div>
                <div className="form-actions">
                  <button className="secondary-button" type="button" onClick={() => setView("list")}><IconX className="nav-icon" /> Cancelar</button>
                </div>
                {feedback ? <p className="admin-feedback">{feedback}</p> : null}
              </aside>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Title({ text }: { text: string }) { return <div className="section-title"><span />{text}</div>; }
function Cost({ label, value, bold = false, dot, subtotal = false }: { label: string; value: number; bold?: boolean; dot?: string; subtotal?: boolean }) {
  const className = ["cost-line", bold && "bold", subtotal && "subtotal"].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <span>{dot ? <i className="cost-dot" style={{ background: dot }} /> : null}{label}</span>
      <strong>{brl(value)}</strong>
    </div>
  );
}
// Linha texto→texto (não-monetária) do mesmo jeito visual do Cost — usada só
// no detalhamento de Margem & Taxas do resumo (não entra em PDF/WhatsApp,
// que são gerados à parte, sem ler esse bloco).
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="cost-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Páginas do catálogo">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Página anterior">‹</button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
        <button type="button" key={item} className={item === page ? "selected" : ""} onClick={() => onChange(item)}>{item}</button>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="Próxima página">›</button>
    </nav>
  );
}
