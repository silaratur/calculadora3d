"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "@/components/AdminHeader";
import { IconBookmark, IconChevronDown, IconChevronUp, IconClock, IconCopy, IconDownload, IconSave, IconShoppingBag, IconTrash } from "@/components/Icons";
import { ProductPhotoLink } from "@/components/ProductPreview";
import { catalogPriceDrift, quoteStatusLabel } from "@/lib/quotes";
import { QuoteRevisionView } from "@/components/QuoteRevisionView";
import { calculatePieceCost, calculateSuggestedPrice, effectiveMonthlyFixedCost, fixedCostPerPiece, markupPercentForFinalPrice, type PricingMethod, type PricingSettingsLike } from "@/lib/costing";
import { defaultColor, productColors, resolveColorLine, singleFilamentRecipe, filamentForColor, type VariantMaterial } from "@/lib/color-variants";
import { swatch } from "@/lib/filament-colors";
import { brl } from "@/lib/money";

// Produto já cadastrado no Catálogo — custo e tempo de impressão vêm prontos
// de lá (calculados com o motor multi-material do Catálogo), então aqui só
// usamos os valores finais, sem recalcular nada.
// materials/colors/materialCost/lossRatePercent: para a cor escolhida em cada
// linha trocar o filamento e recalcular o custo real (src/lib/color-variants.ts).
type Product = { id: string; name: string; sku: string; category: string; cost: number; price: number; printTimeHours: number; imageUrl?: string; materialCost: number; lossRatePercent?: number; colors?: string; materials?: { materialId: string; grams: number }[] };
type Supply = { id: string; name: string; category: string; unitCost: number };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };
type CustomExtra = { id: string; name: string; unitCost: number };
type CustomerLead = { id: string; name: string; phone: string; email: string };
// color vazio = cor padrão do produto (a da receita, se oferecida). O mesmo
// produto pode aparecer em várias linhas, uma por cor (2 brancas + 3 beges).
type ProductLine = { productId: string; quantity: string; color?: string };
type SupplyLine = { supplyId: string; quantity: string; unitCost: string };
// Peça sob medida: ainda não existe no Catálogo — custo calculado aqui com a
// mesma fórmula do Catálogo (filamento, energia, máquina, custo fixo rateado
// por hora, mão de obra de acabamento e reserva de perdas das Configurações).
type CustomPiece = { id: string; name: string; materialId: string; grams: string; hours: string; minutes: string; finish: string; quantity: string };
type PricingSettings = PricingSettingsLike & { roundPricesTo90?: boolean };
type Printer = { id: string; model: string; powerWatts: number; purchasePrice: number; usefulLifeHours: number; maintenancePerHour: number };
type Settings = { companyName: string; companyContact: string; quoteDeliveryText: string; quoteWarrantyText: string; quotePaymentText: string };
// Formato salvo em Quote.snapshotJson — precisa bater com o que saveQuote()
// grava, senão "Carregar no Editor" não restaura tudo exatamente como foi
// criado.
type QuoteSnapshot = {
  // custom: peça sob medida (id "sob-medida-…", sem produto no Catálogo) — grams/finishMinutes reabrem o editor.
  products?: { id: string; name: string; quantity: number; unitCost: number; unitPrice?: number; printTimeHours: number; imageUrl?: string; color?: string; materialId?: string; custom?: boolean; grams?: number; finishMinutes?: number }[];
  markup?: string;
  discount?: string;
  supplies?: { id: string; name: string; category?: string; quantity: number; unitCost: number }[];
  customExtras?: CustomExtra[];
  calculations?: Record<string, number>;
  marketplace?: Marketplace;
  pricingMethod?: PricingMethod;
};

type QuoteRevisionEntry = { id: string; number: number; finalPrice: number; baseCost: number; productName: string; snapshotJson: string; notes: string; createdAt: string };
// Estado do orçamento aberto no editor (ciclo da negociação, ver src/lib/quotes.ts).
type QuoteMeta = {
  source?: string;
  sourceDetail?: string; status: string; revision: number; code: string | null; archiveReason: string | null; revisions: QuoteRevisionEntry[]; order: { id: string; orderNumber: string } | null };

const demoSupplies: Supply[] = [{ id: "bag", name: "Embalagem simples", category: "Embalagem & Caixas", unitCost: 0.35 }];
const defaultMarketplace: Marketplace = { id: "direct", name: "Venda Direta", commissionRate: 0, fixedFee: 0, adsRate: 0 };
const emptySettings: Settings = { companyName: "AC3D", companyContact: "", quoteDeliveryText: "", quoteWarrantyText: "", quotePaymentText: "" };
const markupPresets = ["10", "25", "50", "65", "100", "150", "200"];
// Mesma paleta do site de referência para os blocos de custo — usada tanto
// nos pontos da legenda quanto na barra proporcional.
const legendColors = ["#602f32", "#777f5d", "#8a4a4e", "#d1a94a", "#f4bbd3", "#e8ddd7"];

const n = (value: string) => {
  const cleanValue = value.replace(/R\$\s?/g, "").replace(/\s/g, "");
  const normalized = cleanValue.includes(",") ? cleanValue.replace(/\./g, "").replace(",", ".") : cleanValue;
  return Number(normalized) || 0;
};
// Arredonda o total em minutos antes de separar: 49,999 h vira "50h 0m", não "49h 60m".
const fmtHours = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function OrcamentosPage() {
  return (
    <Suspense fallback={null}>
      <OrcamentosForm />
    </Suspense>
  );
}

// useSearchParams() (para restaurar um orçamento salvo via ?quoteId=) exige
// um limite de Suspense acima — daí o componente estar separado do default export.
function OrcamentosForm() {
  const [products, setProducts] = useState<Product[]>([]);
  // Todos os filamentos (inclusive desativados) — só para resolver a cor das linhas.
  const [materials, setMaterials] = useState<VariantMaterial[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>(demoSupplies);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([defaultMarketplace]);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  // Busca com autocomplete pra escolher o produto de cada linha — mesmo
  // padrão do campo de cliente: foco sem digitar abre a lista toda (A-Z),
  // digitando estreita pelas ocorrências. Só uma linha por vez fica aberta.
  const [productPickerOpenIndex, setProductPickerOpenIndex] = useState<number | null>(null);
  const [productPickerQuery, setProductPickerQuery] = useState("");
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([]);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [customers, setCustomers] = useState<CustomerLead[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [markup, setMarkup] = useState("40");
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>("markup");
  const [marketplaceId, setMarketplaceId] = useState("direct");
  const [discount, setDiscount] = useState("0");
  const [customExtras, setCustomExtras] = useState<CustomExtra[]>([]);
  const [customPieces, setCustomPieces] = useState<CustomPiece[]>([]);
  // Janela da peça sob medida (exceção, não seção fixa): rascunho em edição ou null.
  const [pieceDraft, setPieceDraft] = useState<CustomPiece | null>(null);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [monthlyFixedCost, setMonthlyFixedCost] = useState<number | null>(null);
  const [customExtraName, setCustomExtraName] = useState("");
  const [customExtraCost, setCustomExtraCost] = useState("");
  const [notes, setNotes] = useState("");
  const [reportError, setReportError] = useState("");
  // Id do orçamento sendo editado nesta sessão da tela — começa com o que
  // veio na URL (se veio) e passa a valer o id retornado assim que o
  // primeiro "Salvar" cria o registro, pra próximos saves atualizarem esse
  // mesmo orçamento em vez de criar um novo a cada clique.
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<QuoteMeta | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState<number | null>(null);
  const [viewingRevision, setViewingRevision] = useState<QuoteRevisionEntry | null>(null);
  // Orçamento salvo como estava no banco — para avisar se o Catálogo mudou de
  // preço desde então. "keep" = mantendo o preço negociado; "update" = usando
  // os preços atuais (decisão do usuário no alerta).
  const [loadedQuote, setLoadedQuote] = useState<{ snapshotJson: string; finalPrice: number; markup: string; discount: string } | null>(null);
  const [driftChoice, setDriftChoice] = useState<"keep" | "update" | null>(null);
  // Orçamento aprovado já virou venda: só leitura (a API também recusa).
  const readOnly = quoteMeta?.status === "CONVERTED";

  const searchParams = useSearchParams();
  // Vindo de "Carregar no Editor" (?quoteId=...): os valores do orçamento
  // salvo têm que prevalecer sobre os padrões globais. Sem id na URL (ex:
  // clicou em "Orçamentos" no menu) a tela abre em branco/com os padrões.
  const quoteId = searchParams.get("quoteId");
  // Vindo do Catálogo (?productId=...): já entra com esse produto adicionado
  // como primeira linha.
  const productId = searchParams.get("productId");

  useEffect(() => {
    // Catálogo pode mudar (preço/custo de produto editado) enquanto esta aba
    // de Orçamentos continua aberta — sem no-store o navegador pode servir uma
    // resposta em cache, e sem o refetch abaixo o orçamento calcularia sempre
    // com o valor que estava em memória desde o carregamento da página.
    async function loadCatalog() {
      const [productsRes, suppliesRes, materialsRes] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/supplies", { cache: "no-store" }),
        fetch("/api/materials?all=true", { cache: "no-store" }),
      ]);
      if (productsRes.ok) setProducts((await productsRes.json()) as Product[]);
      if (materialsRes.ok) setMaterials((await materialsRes.json()) as VariantMaterial[]);
      if (suppliesRes.ok) { const data = (await suppliesRes.json()) as Supply[]; if (data.length) setSupplies(data); }
    }
    async function load() {
      await loadCatalog();
      const responses = await Promise.all([fetch("/api/settings"), fetch("/api/marketplaces"), fetch("/api/customers"), fetch("/api/printers"), fetch("/api/costs/fixed")]);
      if (responses[3].ok) setPrinters((await responses[3].json()) as Printer[]);
      if (responses[4].ok) {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        setMonthlyFixedCost(effectiveMonthlyFixedCost((await responses[4].json()) as { month: string; total: number }[], month));
      }
      if (responses[0].ok) {
        const data = (await responses[0].json()) as Settings & PricingSettings;
        setPricingSettings(data);
        if (!quoteId) setMarkup(String(data.defaultMarkup));
        setSettings({ companyName: data.companyName, companyContact: data.companyContact, quoteDeliveryText: data.quoteDeliveryText, quoteWarrantyText: data.quoteWarrantyText, quotePaymentText: data.quotePaymentText });
      }
      // "Venda Direta" (0% de taxas) fica sempre disponível — antes, se você já
      // tivesse canais cadastrados em Configurações, ela desaparecia da lista.
      if (responses[1].ok) { const data = (await responses[1].json()) as Marketplace[]; setMarketplaces([defaultMarketplace, ...data]); }
      if (responses[2].ok) setCustomers((await responses[2].json()) as CustomerLead[]);
    }
    void load();

    function onFocus() {
      if (document.visibilityState === "visible") void loadCatalog();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [quoteId]);

  /** Preenche o editor com uma versão do orçamento (a atual ou uma revisão antiga). */
  function applyVersion(productName: string, versionNotes: string, snapshotJson: string) {
    setName(productName);
    setNotes(versionNotes);
    let s: QuoteSnapshot = {};
    try { s = JSON.parse(snapshotJson) as QuoteSnapshot; } catch { s = {}; }
    setProductLines((s.products ?? []).filter((item) => !item.custom).map((item) => ({ productId: item.id, quantity: String(item.quantity ?? 1), color: item.color ?? "" })));
    setCustomPieces((s.products ?? []).filter((item) => item.custom).map((item) => ({
      id: item.id,
      name: item.name,
      materialId: item.materialId ?? "",
      grams: String(item.grams ?? 0).replace(".", ","),
      hours: String(Math.floor(item.printTimeHours)),
      minutes: String(Math.round((item.printTimeHours % 1) * 60)),
      finish: String(item.finishMinutes ?? 0),
      quantity: String(item.quantity ?? 1),
    })));
    if (s.markup !== undefined) setMarkup(s.markup);
    if (s.discount !== undefined) setDiscount(s.discount);
    if (s.marketplace?.id) setMarketplaceId(s.marketplace.id);
    if (s.pricingMethod) setPricingMethod(s.pricingMethod);
    setSupplyLines((s.supplies ?? []).map((item) => ({ supplyId: item.id, quantity: String(item.quantity ?? 1), unitCost: String(item.unitCost ?? 0).replace(".", ",") })));
    setCustomExtras(s.customExtras ?? []);
  }

  useEffect(() => {
    if (!quoteId) return;
    async function loadQuote() {
      setCurrentQuoteId(quoteId);
      const response = await fetch(`/api/quotes/${quoteId}`);
      if (!response.ok) return;
      const quote = (await response.json()) as { productName: string; customerName: string; customerPhone: string; customerEmail: string; notes: string; snapshotJson: string; finalPrice: number } & QuoteMeta;
      setClient(quote.customerName);
      setClientPhone(quote.customerPhone);
      setClientEmail(quote.customerEmail);
      applyVersion(quote.productName, quote.notes, quote.snapshotJson);
      setLoadedQuote(negotiatedVersion(quote.snapshotJson, quote.finalPrice));
      setDriftChoice(null);
      setQuoteMeta({ source: quote.source, sourceDetail: quote.sourceDetail, status: quote.status, revision: quote.revision, code: quote.code, archiveReason: quote.archiveReason, revisions: quote.revisions ?? [], order: quote.order ?? null });
    }
    void loadQuote();
  }, [quoteId]);

  // Só entra depois que a lista de produtos já carregou (senão não tem o que adicionar).
  useEffect(() => {
    if (!productId || !products.length) return;
    const id = productId;
    function addFromQuery() {
      setProductLines((current) => (current.some((line) => line.productId === id) ? current : [...current, { productId: id, quantity: "1" }]));
    }
    addFromQuery();
  }, [productId, products]);

  const marketplace = marketplaces.find((item) => item.id === marketplaceId) ?? marketplaces[0] ?? defaultMarketplace;
  const clientSuggestions = useMemo(() => {
    const query = client.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 6);
  }, [client, customers]);

  function bumpMarkup(delta: number) {
    setMarkup(String(Math.min(200, Math.max(0, n(markup) + delta))));
  }

  function productSuggestions(index: number, currentProductId: string) {
    const query = productPickerQuery.trim().toLowerCase();
    // O mesmo produto pode entrar de novo (outra cor) — a lista mostra todos.
    void index;
    void currentProductId;
    const matches = query ? products.filter((item) => item.name.toLowerCase().includes(query)) : products;
    return [...matches].sort((a, b) => a.name.localeCompare(b.name));
  }

  function addProductLine() {
    const usedIds = new Set(productLines.map((line) => line.productId));
    const next = products.find((item) => !usedIds.has(item.id)) ?? products[0];
    if (!next) return;
    setProductLines((current) => [...current, { productId: next.id, quantity: "1" }]);
  }
  function updateProductLine(index: number, patch: Partial<ProductLine>) {
    setProductLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function bumpProductQuantity(index: number, delta: number) {
    setProductLines((current) => current.map((line, i) => (i === index ? { ...line, quantity: String(Math.max(1, (n(line.quantity) || 1) + delta)) } : line)));
  }
  function removeProductLine(index: number) {
    setProductLines((current) => current.filter((_, i) => i !== index));
  }

  // Cada linha resolve a cor: filamento do mesmo tipo naquela cor e o custo
  // real com ele. O preço continua o do Catálogo (único para todas as cores).
  const productLinesWithData = useMemo(
    () => productLines.flatMap((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product) return [];
      const color = line.color || defaultColor(product, materials);
      const resolved = resolveColorLine(product, color, materials);
      return [{ line, product, color, material: resolved.material, unitCost: resolved.unitCost }];
    }),
    [productLines, products, materials],
  );

  const lineEntry = (index: number) => productLinesWithData.find((entry) => entry.line === productLines[index]);
  const lineCost = (index: number, product: Product) => lineEntry(index)?.unitCost ?? product.cost;
  const colorOf = (line: ProductLine, product: Product) => line.color || defaultColor(product, materials);

  function addSupplyLine() {
    const usedIds = new Set(supplyLines.map((line) => line.supplyId));
    const next = supplies.find((item) => !usedIds.has(item.id));
    if (!next) return;
    setSupplyLines((current) => [...current, { supplyId: next.id, quantity: "1", unitCost: String(next.unitCost).replace(".", ",") }]);
  }
  function updateSupplyLine(index: number, patch: Partial<SupplyLine>) {
    setSupplyLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function bumpSupplyQuantity(index: number, delta: number) {
    setSupplyLines((current) => current.map((line, i) => (i === index ? { ...line, quantity: String(Math.max(1, (n(line.quantity) || 1) + delta)) } : line)));
  }
  function removeSupplyLine(index: number) {
    setSupplyLines((current) => current.filter((_, i) => i !== index));
  }

  const supplyLinesWithData = useMemo(
    () => supplyLines
      .map((line) => ({ line, supply: supplies.find((item) => item.id === line.supplyId) }))
      .filter((entry): entry is { line: SupplyLine; supply: Supply } => Boolean(entry.supply)),
    [supplyLines, supplies],
  );

  // A1 é a impressora mais usada (mesmo padrão do produto novo no Catálogo).
  const defaultPrinter = printers.find((item) => item.model.toLowerCase().includes("a1")) ?? printers[0];
  const pieceFigures = useCallback((piece: CustomPiece) => {
    const material = materials.find((item) => item.id === piece.materialId);
    const printTimeHours = n(piece.hours) + n(piece.minutes) / 60;
    const grams = n(piece.grams);
    const valid = Boolean(piece.name.trim() && material && grams > 0 && printTimeHours > 0 && pricingSettings);
    if (!valid || !material || !pricingSettings) return { piece, material, printTimeHours, grams, valid: false, unitCost: 0, unitPrice: 0 };
    const cost = calculatePieceCost({
      weightGrams: grams,
      materialUnitPrice: material.unitPrice,
      materialUnitWeightGrams: material.unitWeightGrams,
      printTimeHours,
      cleanupMinutes: n(piece.finish),
      laborRatePerHour: pricingSettings.laborRate,
      energyRatePerKwh: pricingSettings.energyRate,
      powerWatts: defaultPrinter?.powerWatts ?? pricingSettings.defaultPowerWatts,
      printerPurchasePrice: defaultPrinter?.purchasePrice,
      printerUsefulLifeHours: defaultPrinter?.usefulLifeHours,
      printerMaintenancePerHour: defaultPrinter?.maintenancePerHour,
      fixedCostPerPiece: fixedCostPerPiece(pricingSettings, monthlyFixedCost ?? undefined, printTimeHours),
      lossRatePercent: pricingSettings.defaultLossRate,
    });
    // "Preço de Catálogo" da peça: markup padrão e arredondamento em ,90 das
    // Configurações — o mesmo que ela teria se fosse cadastrada no Catálogo.
    const unitPrice = calculateSuggestedPrice({ unitCost: cost.total, markupPercent: pricingSettings.defaultMarkup, roundTo90: pricingSettings.roundPricesTo90 ?? false }).final;
    return { piece, material, printTimeHours, grams, valid: true, unitCost: cost.total, unitPrice };
  }, [materials, pricingSettings, defaultPrinter, monthlyFixedCost]);
  const customPiecesWithData = useMemo(() => customPieces.map(pieceFigures), [customPieces, pieceFigures]);
  const draftFigures = pieceDraft ? pieceFigures(pieceDraft) : null;

  function openNewPiece() {
    setPieceDraft({ id: `sob-medida-${Date.now()}`, name: "", materialId: "", grams: "", hours: "0", minutes: "0", finish: "0", quantity: "1" });
  }
  function confirmPieceDraft() {
    if (!pieceDraft || !draftFigures?.valid) return;
    setCustomPieces((current) => (current.some((piece) => piece.id === pieceDraft.id) ? current.map((piece) => (piece.id === pieceDraft.id ? pieceDraft : piece)) : [...current, pieceDraft]));
    setPieceDraft(null);
  }
  function updateCustomPiece(id: string, patch: Partial<CustomPiece>) {
    setCustomPieces((current) => current.map((piece) => (piece.id === id ? { ...piece, ...patch } : piece)));
  }
  function removeCustomPiece(id: string) {
    setCustomPieces((current) => current.filter((piece) => piece.id !== id));
  }
  /** Abre o Catálogo com um produto novo já preenchido a partir da peça sob medida. */
  function catalogLinkFor(piece: CustomPiece) {
    const params = new URLSearchParams({ novo: "1", nome: piece.name.trim(), material: piece.materialId, gramas: piece.grams, horas: piece.hours, minutos: piece.minutes, acabamento: piece.finish });
    return `/catalog?${params}`;
  }

  const calc = useMemo(() => {
    // Base é o Preço Final Sugerido de cada produto no Catálogo (já com o
    // markup/margem definidos lá), não o custo — senão o orçamento recalcula
    // do zero em cima do custo e ignora o preço que já foi ajustado no
    // Catálogo (inclusive via "digite o preço final"). O markup do orçamento
    // ainda se aplica por cima dessa base, junto com os insumos/extras.
    const validPieces = customPiecesWithData.filter((entry) => entry.valid);
    const productsCost = productLinesWithData.reduce((sum, entry) => sum + entry.product.price * (n(entry.line.quantity) || 1), 0)
      + validPieces.reduce((sum, entry) => sum + entry.unitPrice * (n(entry.piece.quantity) || 1), 0);
    const productsPrintTime = productLinesWithData.reduce((sum, entry) => sum + entry.product.printTimeHours * (n(entry.line.quantity) || 1), 0)
      + validPieces.reduce((sum, entry) => sum + entry.printTimeHours * (n(entry.piece.quantity) || 1), 0);
    const presetsCost = supplyLinesWithData.reduce((sum, entry) => sum + (n(entry.line.unitCost) || entry.supply.unitCost) * (n(entry.line.quantity) || 1), 0);
    const customCost = customExtras.reduce((sum, item) => sum + item.unitCost, 0);
    const suppliesCost = presetsCost + customCost;
    // Sem reserva para perdas aqui — cada produto do catálogo já embute o
    // próprio risco de falha/refugo no preço dele, calculado lá na origem.
    const costWithReserve = productsCost + suppliesCost;
    const pricing = calculateSuggestedPrice({
      unitCost: costWithReserve,
      markupPercent: n(markup),
      channel: marketplace,
      discountPerUnit: n(discount),
      method: pricingMethod,
    });
    // Lucro de verdade: preço final menos taxas do canal e o CUSTO de produção
    // (produtos pelo custo do Catálogo, não pelo preço de venda, + insumos).
    // Sem isso, um orçamento no preço do Catálogo (ex.: pedido da loja, markup
    // 0) mostrava lucro zero, embora o lucro já esteja embutido no preço.
    const productsRealCost = productLinesWithData.reduce((sum, entry) => sum + entry.unitCost * (n(entry.line.quantity) || 1), 0)
      + validPieces.reduce((sum, entry) => sum + entry.unitCost * (n(entry.piece.quantity) || 1), 0);
    const realCost = productsRealCost + suppliesCost;
    const takeRate = Math.max(1 - marketplace.commissionRate - marketplace.adsRate, 0.01);
    const channelFees = pricing.final * (1 - takeRate) + (pricing.final > 0 ? marketplace.fixedFee : 0);
    const realProfit = pricing.final - channelFees - realCost;
    return {
      printTime: productsPrintTime,
      productsCost,
      productsRealCost,
      realCost,
      realProfit,
      suppliesCost,
      insumosCount: supplyLinesWithData.length + customExtras.length,
      costWithReserve,
      minimumPrice: pricing.minimum,
      price: pricing.final,
      profit: pricing.final - costWithReserve,
    };
  }, [customExtras, customPiecesWithData, discount, markup, marketplace, pricingMethod, productLinesWithData, supplyLinesWithData]);

  const quickChannels = marketplaces.slice(0, 4);

  function addCustomExtra() {
    const cost = n(customExtraCost);
    if (!customExtraName.trim() || !cost) return;
    setCustomExtras((current) => [...current, { id: `custom-${Date.now()}`, name: customExtraName.trim(), unitCost: cost }]);
    setCustomExtraName("");
    setCustomExtraCost("");
  }
  function removeCustomExtra(id: string) {
    setCustomExtras((current) => current.filter((item) => item.id !== id));
  }

  /** Nome, telefone e e-mail do cliente agora são obrigatórios pra salvar. */
  function clientFieldsValid(): boolean {
    const message = !client.trim()
      ? "Informe o nome do cliente."
      : !clientPhone.trim()
        ? "Informe o telefone do cliente."
        : !clientEmail.trim()
          ? "Informe o e-mail do cliente."
          : customPiecesWithData.some((entry) => !entry.valid)
            ? "Complete a peça sob medida (nome, filamento, gramas e tempo de impressão) ou remova-a."
            : "";
    if (!message) return true;
    setReportError(message);
    window.setTimeout(() => setReportError(""), 3500);
    return false;
  }

  /**
   * Cliente já cadastrado (mesmo nome) não duplica; cliente novo é cadastrado
   * na hora em Clientes, com o telefone e e-mail informados aqui — sem isso,
   * o orçamento tinha um nome digitado que não virava um cliente de verdade.
   * Best-effort: se o cadastro falhar, não trava o salvar do orçamento.
   */
  async function ensureCustomerRegistered() {
    const trimmedName = client.trim();
    if (customers.some((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase())) return;
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, phone: clientPhone.trim(), email: clientEmail.trim() }),
      });
      if (response.ok) {
        const created = (await response.json()) as CustomerLead;
        setCustomers((current) => [...current, created]);
      }
    } catch {
      // Best-effort — orçamento continua sendo salvo mesmo se isto falhar.
    }
  }

  // Restaurar só preenche o editor — vira a próxima revisão quando você salvar.
  // O preço volta ao da revisão (o negociado com o cliente), mesmo que o
  // Catálogo tenha mudado desde então — igual a abrir um orçamento salvo; o
  // aviso de preços do Catálogo deixa trocar para os preços atuais.
  function restoreRevision(revision: QuoteRevisionEntry) {
    applyVersion(revision.productName, revision.notes, revision.snapshotJson);
    setLoadedQuote(negotiatedVersion(revision.snapshotJson, revision.finalPrice));
    setDriftChoice(null);
    setRestoredFrom(revision.number);
    setHistoryOpen(false);
  }

  // Aprovado não muda: copia o conteúdo pra um orçamento novo (outro número).
  function duplicateAsNew() {
    setCurrentQuoteId(null);
    setQuoteMeta(null);
    setRestoredFrom(null);
    window.history.replaceState(null, "", "/orcamentos");
  }

  async function reopenQuote() {
    if (!currentQuoteId) return;
    const response = await fetch(`/api/quotes/${currentQuoteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen" }) });
    if (!response.ok) { setReportError("Não foi possível reabrir o orçamento."); return; }
    setQuoteMeta((meta) => (meta ? { ...meta, status: "DRAFT", archiveReason: "" } : meta));
  }

  async function saveQuote(): Promise<{ id: string } | null> {
    // Aprovado é só leitura: o PDF/WhatsApp usam a versão salva, sem regravar.
    if (readOnly && currentQuoteId) return { id: currentQuoteId };
    await ensureCustomerRegistered();
    // Nome dos insumos vai junto no snapshot (não só o id) — o orçamento em
    // PDF (src/app/quotes/[id]/print) lista "o que está incluso" sem precisar
    // reconsultar a Biblioteca, que pode ter mudado ou perdido o preset depois.
    const snapshot: QuoteSnapshot = {
      products: productLinesWithData.map((entry) => ({
        id: entry.product.id,
        name: entry.product.name,
        quantity: n(entry.line.quantity) || 1,
        unitCost: entry.unitCost,
        // Preço do Catálogo usado neste orçamento — base do alerta de mudança de preço.
        unitPrice: entry.product.price,
        printTimeHours: entry.product.printTimeHours,
        imageUrl: entry.product.imageUrl,
        // Cor e filamento da linha: aparecem no PDF/Produção e guiam a baixa de estoque.
        ...(entry.color ? { color: entry.color } : {}),
        ...(entry.material ? { materialId: entry.material.id } : {}),
      })).concat(customPiecesWithData.filter((entry) => entry.valid).map((entry) => ({
        id: entry.piece.id,
        name: entry.piece.name.trim(),
        quantity: n(entry.piece.quantity) || 1,
        unitCost: entry.unitCost,
        unitPrice: entry.unitPrice,
        printTimeHours: entry.printTimeHours,
        imageUrl: undefined,
        ...(entry.material?.color ? { color: entry.material.color } : {}),
        ...(entry.material ? { materialId: entry.material.id } : {}),
        custom: true,
        grams: entry.grams,
        finishMinutes: n(entry.piece.finish),
      }))),
      markup,
      discount,
      supplies: supplyLinesWithData.map((entry) => ({
        id: entry.supply.id,
        name: entry.supply.name,
        category: entry.supply.category,
        quantity: n(entry.line.quantity) || 1,
        unitCost: n(entry.line.unitCost) || entry.supply.unitCost,
      })),
      customExtras,
      calculations: calc,
      marketplace,
      pricingMethod,
    };
    // Depois do primeiro save, currentQuoteId já aponta pro registro criado —
    // os próximos saves atualizam (PUT) esse mesmo orçamento em vez de criar
    // um novo a cada clique em "Salvar" (o que duplicava linhas em Projetos).
    const response = await fetch(currentQuoteId ? `/api/quotes/${currentQuoteId}` : "/api/quotes", {
      method: currentQuoteId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName: name, customerName: client.trim(), customerPhone: clientPhone.trim(), customerEmail: clientEmail.trim(), status: "DRAFT", baseCost: calc.costWithReserve, finalPrice: calc.price, margin: calc.profit, snapshot, notes }),
    });
    localStorage.setItem("minima3d-project", JSON.stringify({ name, client, price: calc.price, notes, snapshot }));
    if (!response.ok) return null;
    const result = (await response.json()) as { id: string };
    if (!currentQuoteId) setCurrentQuoteId(result.id);
    return result;
  }
  async function save() {
    if (!clientFieldsValid()) return;
    const result = await saveQuote();
    if (!result) {
      setReportError("Não foi possível salvar o orçamento. Tente novamente.");
      window.setTimeout(() => setReportError(""), 3500);
      return;
    }
    // Depois de salvar, volta pra lista em Projetos — de lá dá pra ver o
    // orçamento salvo junto com os demais e reabrir pra editar de novo.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/projects";
  }
  async function generateReport() {
    if (!name.trim()) {
      setReportError("Preencha o nome do orçamento antes de gerar o PDF.");
      window.setTimeout(() => setReportError(""), 3500);
      return;
    }
    if (!clientFieldsValid()) return;
    setReportError("");
    // Abre a aba já no clique (síncrono) pra não ser bloqueada como pop-up:
    // navegadores permitem window.open só durante o gesto do usuário, e o
    // await do saveQuote() logo abaixo já tira a chamada desse contexto.
    const win = window.open("", "_blank");
    const result = await saveQuote();
    if (!result) {
      win?.close();
      setReportError("Não foi possível salvar o orçamento. Tente novamente.");
      window.setTimeout(() => setReportError(""), 3500);
      return;
    }
    if (win) win.location.href = `/quotes/${result.id}/print`;
    else window.open(`/quotes/${result.id}/print`, "_blank");
  }

  /**
   * Mensagem pronta pra colar no WhatsApp — mesmo conteúdo do orçamento em
   * PDF (itens inclusos, prazos, pagamento, garantia), formatada com o
   * negrito (*texto*) que o WhatsApp já entende, sem precisar salvar nada.
   */
  function buildWhatsAppMessage() {
    const items = [
      ...productLinesWithData.map((entry) => {
        const quantity = n(entry.line.quantity) || 1;
        const label = entry.color ? `${entry.product.name} — ${entry.color}` : entry.product.name;
        return quantity > 1 ? `${label} (x${quantity})` : label;
      }),
      // Embalagem/caixa é custo interno, não um item que o cliente escolheu —
      // valor continua embutido no total, só não aparece na lista de itens.
      ...supplyLinesWithData
        .filter((entry) => entry.supply.category !== "Embalagem & Caixas")
        .map((entry) => {
          const quantity = n(entry.line.quantity) || 1;
          return quantity > 1 ? `${entry.supply.name} (x${quantity})` : entry.supply.name;
        }),
      ...customExtras.map((item) => item.name),
    ];
    const lines = [
      `*${settings.companyName || "AC3D"}* — Impressão 3D`,
      "",
      `Olá${client.trim() ? `, ${client.trim()}` : ""}! 💛`,
      "Ficamos muito felizes em saber do seu interesse em nossos produtos! Fazemos cada peça com bastante carinho e capricho, e esperamos que você ame o resultado. Segue abaixo o seu orçamento:",
      "",
      `*Orçamento: ${name.trim() || "Sem título"}*`,
      client.trim() ? `Cliente: ${client.trim()}` : null,
      "",
      items.length ? "📦 *Itens inclusos:*" : null,
      ...items.map((item) => `• ${item}`),
      items.length ? "" : null,
      `💰 *Valor total:* ${brl(calc.price)}`,
      "",
      `📅 *Prazo de produção:* ${settings.quoteDeliveryText || "A combinar"}`,
      `💳 *Forma de pagamento:* ${settings.quotePaymentText || "A combinar"}`,
      `🛡️ *Garantia:* ${settings.quoteWarrantyText || "A combinar"}`,
      notes.trim() ? "" : null,
      notes.trim() ? `📝 *Observações:* ${notes.trim()}` : null,
      "",
      "✅ *Gostou da proposta?* É só responder esta mensagem confirmando o pedido que já colocamos seu produto em produção!",
      "",
      settings.companyContact ? settings.companyContact : null,
      "Qualquer dúvida, estou à disposição! 😊",
    ];
    return lines.filter((line) => line !== null).join("\n");
  }

  const realMarginPercent = calc.price ? (calc.realProfit / calc.price) * 100 : 0;
  // markup guarda casas decimais extras (evita o preço voltar arredondado
  // quando calculado a partir do % — mesma lógica do Catálogo) — só
  // arredonda pra exibir.
  const markupDisplay = Math.round(n(markup));

  // Caminho inverso: digitar o preço final do orçamento (ex: 23,90) acha o
  // markup que chega nele, em vez de sobrescrever o preço direto — mesmo
  // mecanismo do Catálogo, só que aplicado sobre a base do orçamento inteiro
  // (produtos já com preço do Catálogo + insumos/extras).
  function applyFinalPrice(value: string) {
    const target = n(value);
    if (!target || !calc.costWithReserve) return;
    // A base já é o preço de venda do Catálogo, e o markup não fica negativo:
    // preço abaixo da base vira Desconto Especial (markup 0), senão o campo
    // voltava sozinho para o valor da base. Na base ou acima, o preço sai só
    // da margem e o desconto zera (não fica um desconto "fantasma" no PDF).
    const atBase = calculateSuggestedPrice({ unitCost: calc.costWithReserve, markupPercent: 0, channel: marketplace, method: pricingMethod }).final;
    if (target < atBase - 0.004) {
      setMarkup("0");
      setDiscount((atBase - target).toFixed(2).replace(".", ","));
      return;
    }
    const percent = markupPercentForFinalPrice({
      unitCost: calc.costWithReserve,
      finalPrice: target,
      channel: marketplace,
      method: pricingMethod,
    });
    setDiscount("0");
    setMarkup(String(Math.round(percent * 10000) / 10000));
  }

  // Preços do Catálogo mudaram desde que este orçamento (em aberto) foi salvo?
  const priceDrift = useMemo(() => {
    if (!loadedQuote || !products.length || quoteMeta?.status !== "DRAFT") return null;
    return catalogPriceDrift(loadedQuote.snapshotJson, (id) => products.find((item) => item.id === id)?.price);
  }, [loadedQuote, products, quoteMeta?.status]);
  // Padrão: o preço combinado com o cliente não muda sozinho — recalcula o
  // markup para chegar no preço salvo com a base nova (o usuário pode trocar).
  useEffect(() => {
    if (!priceDrift || driftChoice || !loadedQuote || !calc.costWithReserve) return;
    const negotiated = loadedQuote.finalPrice;
    function keepNegotiatedPrice() {
      applyFinalPrice(String(negotiated));
      setDriftChoice("keep");
    }
    keepNegotiatedPrice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceDrift, driftChoice, loadedQuote, calc.costWithReserve]);

  const costSegments = [
    { label: "Produtos", value: calc.productsCost, color: legendColors[0] },
    { label: "Insumos", value: calc.suppliesCost, color: legendColors[4] },
  ];
  const costSegmentsTotal = costSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <main className="calculator-shell">
      <AdminHeader active="orcamentos" />
      <div className="calculator-content">
        {quoteMeta ? (
          <section className={`quote-status-bar status-${quoteMeta.status.toLowerCase()}`}>
            <div className="quote-status-main">
              <span className="quote-status-chip">{quoteStatusLabel[quoteMeta.status] ?? quoteMeta.status}</span>
              <strong>{quoteMeta.code ? `#${quoteMeta.code.replace(/^ORC-/, "")}` : "Orçamento"}</strong>
              {quoteMeta.status !== "CONVERTED" ? <span className="quote-status-rev">Revisão {quoteMeta.revision}</span> : null}
              {quoteMeta.source && quoteMeta.source !== "manual" ? (
                <span className="quote-card-source">
                  {quoteMeta.source === "loja-encomenda" ? "Festas e empresas" : "Pedido da loja online"}
                  {quoteMeta.sourceDetail && quoteMeta.sourceDetail !== "direto" ? ` · via ${quoteMeta.sourceDetail}` : ""}
                </span>
              ) : null}
              {restoredFrom ? <span className="quote-status-note">Conteúdo da revisão {restoredFrom} carregado — salve pra ele virar a revisão {quoteMeta.revision + 1}.</span> : null}
              {quoteMeta.status === "CONVERTED" ? (
                <span className="quote-status-note">
                  Aprovado e convertido em venda{quoteMeta.order ? <> — <a href={`/sales/${quoteMeta.order.id}`}>ver venda #{quoteMeta.order.orderNumber.replace(/^PED-/, "")}</a></> : null}. Só leitura.
                </span>
              ) : null}
              {quoteMeta.status === "ARCHIVED" ? <span className="quote-status-note">Reprovado{quoteMeta.archiveReason ? `: ${quoteMeta.archiveReason}` : ""}.</span> : null}
            </div>
            <div className="quote-status-actions">
              {quoteMeta.revisions.length && quoteMeta.status !== "CONVERTED" ? (
                <button type="button" className="secondary-button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
                  Histórico ({quoteMeta.revisions.length})
                </button>
              ) : null}
              {quoteMeta.status === "ARCHIVED" ? <button type="button" className="secondary-button" onClick={() => void reopenQuote()}>Reabrir orçamento</button> : null}
              {quoteMeta.status === "CONVERTED" ? <button type="button" className="primary-button" onClick={duplicateAsNew}>Duplicar como novo orçamento</button> : null}
            </div>
            {historyOpen ? (
              <ol className="quote-history">
                <li className="current"><span>Revisão {quoteMeta.revision} (atual)</span><span className="num">{brl(calc.price)}</span><span /></li>
                {quoteMeta.revisions.map((revision) => (
                  <li key={revision.id}>
                    <span>Revisão {revision.number} · {new Date(revision.createdAt).toLocaleDateString("pt-BR")}</span>
                    <span className="num">{brl(revision.finalPrice)}</span>
                    <span className="quote-history-actions">
                      <button type="button" className="edit-button" onClick={() => setViewingRevision(revision)}>Ver</button>
                      <button type="button" className="edit-button" onClick={() => restoreRevision(revision)}>Restaurar</button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}
        {viewingRevision ? (
          <QuoteRevisionView
            revision={viewingRevision}
            onClose={() => setViewingRevision(null)}
            onRestore={() => { restoreRevision(viewingRevision); setViewingRevision(null); }}
          />
        ) : null}
        {priceDrift && loadedQuote ? (
          <div className="price-drift-alert" role="alert">
            <strong>⚠ Os preços do Catálogo mudaram desde que este orçamento foi salvo</strong>
            {priceDrift.changes.length ? (
              <ul>{priceDrift.changes.map((change) => <li key={change.name}>{change.name}: {brl(change.before)} → <b>{brl(change.after)}</b></li>)}</ul>
            ) : (
              <p>Soma dos produtos: {brl(priceDrift.savedBase)} → <b>{brl(priceDrift.currentBase)}</b></p>
            )}
            {driftChoice === "update" ? (
              <p>Usando os preços atuais. <button type="button" className="link-button" onClick={() => { applyFinalPrice(String(loadedQuote.finalPrice)); setDriftChoice("keep"); }}>Voltar ao preço negociado ({brl(loadedQuote.finalPrice)})</button></p>
            ) : (
              <p>
                Mantendo o preço negociado com o cliente: <b>{brl(loadedQuote.finalPrice)}</b>.{" "}
                <button type="button" className="link-button" onClick={() => { setMarkup(loadedQuote.markup); setDiscount(loadedQuote.discount); setDriftChoice("update"); }}>Atualizar para os preços atuais</button>
              </p>
            )}
          </div>
        ) : null}
        <fieldset className="readonly-fieldset" disabled={readOnly}>
        <section className="project-header">
          <label className="field-span-full"><span>NOME DO ORÇAMENTO (PRODUTO / KIT / VARIAÇÃO) *</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Porta Guardanapos Árvore de Natal" /></label>

          <div className="client-name-wrap">
            <label>
              <span>NOME DO CLIENTE *</span>
              <input
                required
                value={client}
                onChange={(event) => { setClient(event.target.value); setClientSuggestionsOpen(true); }}
                onFocus={() => setClientSuggestionsOpen(true)}
                onBlur={() => setClientSuggestionsOpen(false)}
                placeholder="Ex: João Silva"
                autoComplete="off"
              />
            </label>
            {clientSuggestionsOpen && clientSuggestions.length > 0 ? (
              <ul className="client-suggestions">
                {clientSuggestions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setClient(item.name);
                        setClientPhone(item.phone);
                        setClientEmail(item.email);
                        setClientSuggestionsOpen(false);
                        (document.activeElement as HTMLElement | null)?.blur();
                      }}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <label>
            <span>TELEFONE *</span>
            <input required type="tel" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} placeholder="(11) 91234-5678" />
          </label>
          <label>
            <span>E-MAIL *</span>
            <input required type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="cliente@email.com" />
          </label>
        </section>
        </fieldset>

        <div className="calculator-grid">
          <fieldset className="readonly-fieldset calculator-main" disabled={readOnly}>
            <section className="calc-section">
              <div className="section-heading-row"><Title text="PRODUTOS DO CATÁLOGO" /><span className="section-total">TOTAL PRODUTOS <strong>{brl(calc.productsCost)}</strong></span></div>
              <div className="field-row library-row">
                <span className="material-lines-label">Adicione um ou mais produtos já cadastrados no Catálogo para montar este orçamento.</span>
                <a className="bookmark-link" href="/catalog" title="Gerenciar produtos no Catálogo"><IconBookmark className="nav-icon" /></a>
              </div>
              <div className="material-lines">
                {productLines.length || customPieces.length ? (
                  <div className="material-line material-line-header product-line">
                    <span />
                    <span>Produto (do Catálogo)</span>
                    <span>Custo</span>
                    <span>Preço de venda</span>
                    <span>Qtd.</span>
                    <span />
                  </div>
                ) : null}
                {productLines.map((line, index) => {
                  const product = products.find((item) => item.id === line.productId);
                  const quantity = n(line.quantity) || 1;
                  return (
                    <div className="material-line product-line" key={index}>
                      <div className="product-line-thumb">
                        {product?.imageUrl ? (
                          <ProductPhotoLink productId={product.id} name={product.name} image={product.imageUrl}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                            <img src={product.imageUrl} alt={product.name} />
                          </ProductPhotoLink>
                        ) : (
                          <span>{product?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
                        )}
                      </div>
                      <div className="client-name-wrap product-picker">
                        <input
                          value={productPickerOpenIndex === index ? productPickerQuery : (product?.name ?? "")}
                          onChange={(event) => setProductPickerQuery(event.target.value)}
                          onFocus={() => { setProductPickerOpenIndex(index); setProductPickerQuery(product?.name ?? ""); }}
                          onBlur={() => setProductPickerOpenIndex(null)}
                          placeholder="Selecione um produto..."
                          autoComplete="off"
                        />
                        {productPickerOpenIndex === index ? (
                          <ul className="client-suggestions">
                            {productSuggestions(index, line.productId).map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    updateProductLine(index, { productId: item.id });
                                    setProductPickerOpenIndex(null);
                                    // O mousedown acima evita blur antes do clique registrar, mas
                                    // isso deixa o foco preso no campo — sem isto, um clique nele de
                                    // novo não reabre a lista (não é um "novo" foco pro navegador) e
                                    // digitar pra buscar de novo fica sem efeito (o valor volta a
                                    // mostrar o nome do produto a cada render).
                                    (document.activeElement as HTMLElement | null)?.blur();
                                  }}
                                >
                                  {item.name}
                                </button>
                              </li>
                            ))}
                            {productSuggestions(index, line.productId).length === 0 ? (
                              <li className="no-suggestions">Nenhum produto encontrado.</li>
                            ) : null}
                          </ul>
                        ) : null}
                        {product && productColors(product.colors).length ? (
                          <ColorPicker product={product} materials={materials} value={colorOf(line, product)} onChange={(color) => updateProductLine(index, { color })} />
                        ) : null}
                      </div>
                      {product ? (
                        <small className="product-line-info" title={`Custo de fabricação${lineEntry(index)?.color ? ` na cor ${lineEntry(index)?.color}` : ""} · ${fmtHours(product.printTimeHours * quantity)} de impressão${quantity > 1 ? ` · ${quantity}x ${brl(lineCost(index, product))} cada` : ""}`}>
                          <IconClock className="nav-icon" /> {brl(lineCost(index, product) * quantity)}
                        </small>
                      ) : <span />}
                      {product ? (
                        <small className="product-line-info product-line-price" title={`Preço de venda sugerido no Catálogo${quantity > 1 ? ` · ${quantity}x ${brl(product.price)} cada` : ""}`}>
                          {brl(product.price * quantity)}
                        </small>
                      ) : <span />}
                      <span className="qty-stepper">
                        <input inputMode="numeric" value={line.quantity} onChange={(event) => updateProductLine(index, { quantity: event.target.value })} placeholder="1" />
                        <span className="qty-stepper-arrows">
                          <button type="button" onClick={() => bumpProductQuantity(index, 1)} aria-label="Aumentar quantidade"><IconChevronUp className="nav-icon" /></button>
                          <button type="button" onClick={() => bumpProductQuantity(index, -1)} aria-label="Diminuir quantidade"><IconChevronDown className="nav-icon" /></button>
                        </span>
                      </span>
                      <button type="button" className="delete-button" onClick={() => removeProductLine(index)} aria-label="Remover produto"><IconTrash className="nav-icon" /></button>
                    </div>
                  );
                })}
                {customPiecesWithData.map(({ piece, material, printTimeHours, grams, unitCost, unitPrice }) => {
                  const quantity = n(piece.quantity) || 1;
                  return (
                    <div className="material-line product-line" key={piece.id}>
                      <div className="product-line-thumb"><span title="Peça sob medida">SM</span></div>
                      <div className="custom-piece-line">
                        <span className="custom-piece-title"><span className="supply-tag">SOB MEDIDA</span>{piece.name}</span>
                        <small>{grams.toLocaleString("pt-BR")} g · {fmtHours(printTimeHours)} · {material?.name.split(" - ")[0] ?? "filamento"}</small>
                        <span className="custom-piece-links">
                          <button type="button" onClick={() => setPieceDraft(piece)}>Editar</button>
                          <a href={catalogLinkFor(piece)} target="_blank" rel="noreferrer">Salvar no Catálogo</a>
                        </span>
                      </div>
                      <small className="product-line-info" title={`Custo de fabricação calculado como no Catálogo${quantity > 1 ? ` · ${quantity}x ${brl(unitCost)} cada` : ""}`}><IconClock className="nav-icon" /> {brl(unitCost * quantity)}</small>
                      <small className="product-line-info product-line-price" title={`Preço com o markup padrão das Configurações${quantity > 1 ? ` · ${quantity}x ${brl(unitPrice)} cada` : ""}`}>{brl(unitPrice * quantity)}</small>
                      <span className="qty-stepper">
                        <input inputMode="numeric" value={piece.quantity} onChange={(event) => updateCustomPiece(piece.id, { quantity: event.target.value })} placeholder="1" />
                        <span className="qty-stepper-arrows">
                          <button type="button" onClick={() => updateCustomPiece(piece.id, { quantity: String(quantity + 1) })} aria-label="Aumentar quantidade"><IconChevronUp className="nav-icon" /></button>
                          <button type="button" onClick={() => updateCustomPiece(piece.id, { quantity: String(Math.max(1, quantity - 1)) })} aria-label="Diminuir quantidade"><IconChevronDown className="nav-icon" /></button>
                        </span>
                      </span>
                      <button type="button" className="delete-button" onClick={() => removeCustomPiece(piece.id)} aria-label={`Remover ${piece.name}`}><IconTrash className="nav-icon" /></button>
                    </div>
                  );
                })}
              </div>
              {products.length === 0 ? <div className="empty-note">Nenhum produto cadastrado no Catálogo ainda.</div> : null}
              <div className="material-lines-actions">
                <button type="button" className="secondary-button" onClick={addProductLine} disabled={!products.length}>+ Adicionar produto</button>
                <button type="button" className="text-link-button" onClick={openNewPiece} disabled={!pricingSettings} title="Para uma peça que ainda não está no Catálogo">Orçar peça sob medida</button>
              </div>
              {productLines.length || customPieces.length ? (
                <div className="metric-wide">
                  <span><IconClock className="nav-icon" /> Tempo total de impressão</span>
                  <strong>{fmtHours(calc.printTime)}</strong>
                </div>
              ) : null}
            </section>

            <section className="calc-section">
              <div className="section-heading-row"><Title text="INSUMOS & ACESSÓRIOS ADICIONAIS" /><span className="section-total">TOTAL INSUMOS <strong>{brl(calc.suppliesCost)}</strong></span></div>
              <div className="field-row library-row">
                <span className="material-lines-label">Adicione um ou mais insumos já cadastrados na Biblioteca para este orçamento.</span>
                <a className="bookmark-link" href="/admin" title="Gerenciar insumos na Biblioteca"><IconBookmark className="nav-icon" /></a>
              </div>
              <div className="material-lines">
                {supplyLines.length ? (
                  <div className="material-line material-line-header supply-line">
                    <span>Insumo (da Biblioteca)</span>
                    <span>Preço unit.</span>
                    <span>Qtd.</span>
                    <span />
                  </div>
                ) : null}
                {supplyLines.map((line, index) => (
                  <div className="material-line supply-line" key={index}>
                    <select
                      value={line.supplyId}
                      onChange={(event) => {
                        const newId = event.target.value;
                        const found = supplies.find((item) => item.id === newId);
                        updateSupplyLine(index, { supplyId: newId, unitCost: found ? String(found.unitCost).replace(".", ",") : line.unitCost });
                      }}
                    >
                      <option value="">Selecione um insumo...</option>
                      {supplies
                        .filter((item) => item.id === line.supplyId || !supplyLines.some((other, otherIndex) => otherIndex !== index && other.supplyId === item.id))
                        .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input className="supply-price" inputMode="decimal" value={line.unitCost} onChange={(event) => updateSupplyLine(index, { unitCost: event.target.value })} />
                    <span className="qty-stepper">
                      <input inputMode="numeric" value={line.quantity} onChange={(event) => updateSupplyLine(index, { quantity: event.target.value })} placeholder="1" />
                      <span className="qty-stepper-arrows">
                        <button type="button" onClick={() => bumpSupplyQuantity(index, 1)} aria-label="Aumentar quantidade"><IconChevronUp className="nav-icon" /></button>
                        <button type="button" onClick={() => bumpSupplyQuantity(index, -1)} aria-label="Diminuir quantidade"><IconChevronDown className="nav-icon" /></button>
                      </span>
                    </span>
                    <button type="button" className="delete-button" onClick={() => removeSupplyLine(index)} aria-label="Remover insumo"><IconTrash className="nav-icon" /></button>
                  </div>
                ))}
              </div>
              {supplies.length === 0 ? <div className="empty-note">Nenhum insumo cadastrado na Biblioteca ainda.</div> : null}
              <div className="material-lines-actions">
                <button type="button" className="secondary-button" onClick={addSupplyLine} disabled={!supplies.length || supplyLines.length >= supplies.length}>+ Adicionar insumos</button>
              </div>
              <div className="custom-extra-row">
                <span className="supply-list-label">Adicionar Outro Insumo Personalizado:</span>
                <div className="custom-extra-fields">
                  <input value={customExtraName} onChange={(event) => setCustomExtraName(event.target.value)} placeholder="Ex: Fita Cetim, Tag Personalizada..." />
                  <input inputMode="decimal" value={customExtraCost} onChange={(event) => setCustomExtraCost(event.target.value)} placeholder="R$ 0,00" />
                  <button type="button" className="secondary-button" onClick={addCustomExtra} disabled={!customExtraName.trim() || !n(customExtraCost)}>+ Adicionar</button>
                </div>
                {customExtras.length ? (
                  <div className="supply-list">
                    {customExtras.map((item) => (
                      <div className="supply-row selected" key={item.id}>
                        <span className="supply-name supply-name-static"><span className="supply-tag">EXTRA</span>{item.name}</span>
                        <strong>{brl(item.unitCost)}</strong>
                        <button type="button" className="row-trash" onClick={() => removeCustomExtra(item.id)} aria-label={`Remover ${item.name}`}><IconTrash className="nav-icon" /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="calc-section">
              <Title text="MARGEM DE LUCRO & TAXAS" />
              <div className="margin-panel margin-panel-compact">
                <div className="margin-panel-head"><span>MARGEM DE LUCRO DESEJADA</span></div>
                <input type="range" min="0" max="200" value={markup} onChange={(event) => setMarkup(event.target.value)} />
                <div className="range-presets">
                  {markupPresets.map((value) => <button type="button" key={value} onClick={() => setMarkup(value)}>{value}%</button>)}
                  <span className="range-stepper">
                    <button type="button" onClick={() => bumpMarkup(-5)} aria-label="Diminuir 5%">−5%</button>
                    <button type="button" onClick={() => bumpMarkup(5)} aria-label="Aumentar 5%">+5%</button>
                  </span>
                  <span className="range-current">
                    <span className="margin-method-badge">{pricingMethod === "markup" ? "Markup" : "Margem Real"}</span>
                    <strong>{markupDisplay}%</strong>
                  </span>
                </div>
              </div>
              <div className="field-grid two pricing-options">
                <label>
                  Método de Precificação
                  <span className="method-toggle">
                    <button type="button" className={pricingMethod === "markup" ? "selected" : ""} onClick={() => setPricingMethod("markup")}>Markup</button>
                    <button type="button" className={pricingMethod === "margin" ? "selected" : ""} onClick={() => setPricingMethod("margin")}>Margem Real</button>
                  </span>
                  <small>{pricingMethod === "markup" ? "Markup multiplica seu custo total pela %." : "Margem Real garante que o lucro seja essa % do preço final."}</small>
                </label>
                <label>
                  <span className="label-icon-text"><IconShoppingBag className="nav-icon" /> Canal de Venda</span>
                  <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>{marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <div className="chip-row">{quickChannels.map((item) => <button type="button" key={item.id} className={marketplaceId === item.id ? "chip selected" : "chip"} onClick={() => setMarketplaceId(item.id)}>{item.name} ({(item.commissionRate * 100).toFixed(0)}%)</button>)}</div>
                  <small>Comissão: {(marketplace.commissionRate * 100).toFixed(1)}% · Ads: {(marketplace.adsRate * 100).toFixed(1)}% · Fixa: {brl(marketplace.fixedFee)}</small>
                </label>
              </div>
              <label className="discount-field">Desconto Especial (R$)<input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /><small>Abatimento aplicado no valor final</small></label>
            </section>

            <section className="calc-section">
              <label className="notes-field">OBSERVAÇÕES & ESPECIFICAÇÕES DO PROJETO (IMPRESSO NO PDF)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: Impresso em layer height 0.2mm, preenchimento 15% gyroid..." /></label>
            </section>
          </fieldset>

          <div className="price-summary-col">
          <aside className="price-summary">
            <span className="summary-eyebrow">PREÇO FINAL SUGERIDO</span>
            <div className="price-final-editable">
              <span>R$</span>
              <input
                key={calc.price.toFixed(2)}
                className="price-final-input"
                inputMode="decimal"
                defaultValue={calc.price.toFixed(2).replace(".", ",")}
                onBlur={(event) => applyFinalPrice(event.target.value)}
                aria-label="Digitar o preço final e calcular a margem"
                disabled={readOnly}
              />
            </div>
            {readOnly ? null : <button className="saved-tag" onClick={save}><IconSave className="nav-icon" /> Salvar</button>}
            <small className="price-final-hint">Digite um preço pra calcular a margem automaticamente</small>
            <hr />
            <div className="summary-title"><span>Composição</span><strong>Custo de Produção: {brl(calc.realCost)}</strong></div>
            <div className="cost-bar">
              {costSegments.map((segment) => (
                <i key={segment.label} title={`${segment.label}: ${brl(segment.value)}`} style={{ width: `${(segment.value / costSegmentsTotal) * 100}%`, background: segment.color }} />
              ))}
            </div>
            <div className="summary-columns">
              <div>
                <Cost label="Produtos" value={calc.productsCost} dot={legendColors[0]} />
                <Cost label="Insumos" value={calc.suppliesCost} dot={legendColors[4]} />
              </div>
            </div>
            <div className="summary-card">
              <Cost label="Preço de Venda dos Produtos" value={calc.productsCost} />
              <Cost label="Custo de Produção dos Produtos" value={calc.productsRealCost} />
              <Info label="Tempo Total de Impressão" value={fmtHours(calc.printTime)} />
              <Cost label={`Insumos (${calc.insumosCount})`} value={calc.suppliesCost} />
              <hr />
              {/* Custo Base é só a base sobre a qual o markup/margem é aplicado — não
                  é o que decide se o orçamento tá bom, por isso fica discreto aqui.
                  O Preço Final Sugerido aparece uma vez só, no topo deste painel. */}
              <Cost label="Base (preços do Catálogo + insumos)" value={calc.costWithReserve} subtotal muted />
              <p className="summary-note">base sobre a qual a margem é aplicada — não é o custo de produção</p>
            </div>
            <div className="summary-card">
              <Info label="Método de Precificação" value={pricingMethod === "markup" ? "Markup" : "Margem Real"} />
              <Info label="% Aplicado" value={`${markupDisplay}%`} />
              <Info label="Canal de Venda" value={marketplace.name} />
              <Info label="Comissão do Canal" value={`${(marketplace.commissionRate * 100).toFixed(1)}%`} />
              <Info label="Ads do Canal" value={`${(marketplace.adsRate * 100).toFixed(1)}%`} />
              <Info label="Taxa Fixa do Canal" value={brl(marketplace.fixedFee)} />
              {n(discount) > 0 ? <Info label="Desconto Especial" value={brl(n(discount))} /> : null}
              <hr />
              <Cost label="Markup sobre o Catálogo & Taxas" value={calc.profit} bold subtotal />
            </div>
            <div className="profit-grid">
              <div className={calc.realProfit < 0 ? "profit-negative" : undefined}>
                <span>LUCRO ESTIMADO</span>
                <strong>{calc.realProfit < 0 ? "−" : "+"}{brl(Math.abs(calc.realProfit))}</strong>
                <small>Sobre o custo de produção ({brl(calc.realCost)}) · {marketplace.name} · Margem Real: {realMarginPercent.toFixed(1)}%</small>
              </div>
              <div><span>PREÇO ATACADO</span><strong>{brl(calc.price * 0.85)}</strong><small>Desconto por volume</small></div>
            </div>
            <button className="report-button" onClick={generateReport}><IconDownload className="nav-icon" /> Gerar Orçamento em PDF</button>
            <button className="whatsapp-button" onClick={() => navigator.clipboard?.writeText(buildWhatsAppMessage())}><IconCopy className="nav-icon" /> Copiar Resumo para WhatsApp</button>
            {/* Longe dos campos do cliente de propósito — ficava colado no e-mail,
                fácil de apagar o orçamento inteiro com um clique sem querer. */}
            <button type="button" className="clear-quote-button" onClick={() => { setName(""); setClient(""); setClientPhone(""); setClientEmail(""); setNotes(""); setProductLines([]); setCurrentQuoteId(null); setQuoteMeta(null); setRestoredFrom(null); }}>Limpar orçamento</button>
          </aside>
          {reportError ? <p className="admin-feedback feedback-error report-error">{reportError}</p> : null}
          </div>
        </div>
      </div>
      {pieceDraft ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Peça sob medida" onClick={() => setPieceDraft(null)}>
          <div className="modal-card modal-card-wide custom-piece-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Peça sob medida</h2>
            <p>Para uma peça que ainda não está no Catálogo. Use os dados do fatiador: o custo segue a mesma fórmula do Catálogo e o preço usa o markup padrão das Configurações.</p>
            <label>Nome da peça<input autoFocus value={pieceDraft.name} onChange={(event) => setPieceDraft({ ...pieceDraft, name: event.target.value })} placeholder="Ex: Chaveiro com logo da empresa" /></label>
            <label>Filamento
              <select value={pieceDraft.materialId} onChange={(event) => setPieceDraft({ ...pieceDraft, materialId: event.target.value })}>
                <option value="">Selecione...</option>
                {materials.filter((item) => item.active !== false || item.id === pieceDraft.materialId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="custom-piece-grid">
              <label>Gramas<input inputMode="decimal" value={pieceDraft.grams} onChange={(event) => setPieceDraft({ ...pieceDraft, grams: event.target.value })} placeholder="18" /></label>
              <label>Horas<input inputMode="numeric" value={pieceDraft.hours} onChange={(event) => setPieceDraft({ ...pieceDraft, hours: event.target.value })} /></label>
              <label>Minutos<input inputMode="numeric" value={pieceDraft.minutes} onChange={(event) => setPieceDraft({ ...pieceDraft, minutes: event.target.value })} /></label>
              <label title="Preparo, limpeza e acabamento, fora do tempo de máquina">Acab. (min)<input inputMode="numeric" value={pieceDraft.finish} onChange={(event) => setPieceDraft({ ...pieceDraft, finish: event.target.value })} /></label>
              <label>Quantidade<input inputMode="numeric" value={pieceDraft.quantity} onChange={(event) => setPieceDraft({ ...pieceDraft, quantity: event.target.value })} /></label>
            </div>
            <div className="custom-piece-preview">
              {draftFigures?.valid ? (
                <>
                  <span>Custo <strong>{brl(draftFigures.unitCost)}</strong> por peça</span>
                  <span>Preço <strong>{brl(draftFigures.unitPrice)}</strong> por peça</span>
                </>
              ) : <span>Preencha nome, filamento, gramas e tempo para calcular.</span>}
            </div>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setPieceDraft(null)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!draftFigures?.valid} onClick={confirmPieceDraft}>{customPieces.some((piece) => piece.id === pieceDraft.id) ? "Salvar alterações" : "Adicionar ao orçamento"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Title({ text }: { text: string }) { return <div className="section-title"><span />{text}</div>; }
function Cost({ label, value, bold = false, dot, subtotal = false, muted = false }: { label: string; value: number; bold?: boolean; dot?: string; subtotal?: boolean; muted?: boolean }) {
  const className = ["cost-line", bold && "bold", subtotal && "subtotal", muted && "muted"].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <span>{dot ? <i className="cost-dot" style={{ background: dot }} /> : null}{label}</span>
      <strong>{brl(value)}</strong>
    </div>
  );
}
// Linha texto→texto (não-monetária) do mesmo jeito visual do Cost — usada só
// no detalhamento de Margem & Taxas do resumo (o PDF/WhatsApp são gerados à
// parte, sem ler esse bloco).
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="cost-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * Cor da peça nesta linha do orçamento. Peças de um filamento trocam o
 * filamento pela cor (mesmo tipo); peças AMS mostram as cores só como
 * informação. Cores sem filamento do mesmo tipo na Biblioteca ficam marcadas.
 */
/** Versão salva (orçamento ou revisão) cujo preço final deve ser mantido quando o Catálogo muda. */
function negotiatedVersion(snapshotJson: string, finalPrice: number) {
  let snapshot: QuoteSnapshot = {};
  try { snapshot = JSON.parse(snapshotJson) as QuoteSnapshot; } catch { /* snapshot antigo */ }
  return { snapshotJson, finalPrice, markup: snapshot.markup ?? "0", discount: snapshot.discount ?? "0" };
}

function ColorPicker({ product, materials, value, onChange }: { product: Product; materials: VariantMaterial[]; value: string; onChange: (color: string) => void }) {
  const colors = productColors(product.colors);
  const recipe = singleFilamentRecipe(product, materials);
  return (
    <label className="product-color-picker" title={value ? `Cor: ${value}` : "Escolher cor"}>
      <span className="filament-swatch" style={{ background: swatch(value || "?") }} />
      <IconChevronDown className="nav-icon" />
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Cor da peça">
        {colors.map((color) => {
          const available = !recipe || Boolean(filamentForColor(recipe.base, color, materials));
          return <option key={color} value={color}>{available ? color : `${color} (sem ${recipe?.base.type} nessa cor)`}</option>;
        })}
      </select>
    </label>
  );
}
