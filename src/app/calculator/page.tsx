"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "@/components/AdminHeader";
import { IconBookmark, IconClock, IconCopy, IconDownload, IconSave, IconShieldAlert, IconShoppingBag, IconSparkles, IconTrash } from "@/components/Icons";
import { calculatePieceCost, calculateSuggestedPrice, fixedCostPerPiece, type PricingMethod } from "@/lib/costing";

type Material = { id: string; name: string; type: string; unitPrice?: number; unitWeightGrams?: number; costPerKg: number };
type Printer = { id: string; model: string; purchasePrice: number; powerWatts: number; usefulLifeHours: number; maintenancePerHour: number };
type Supply = { id: string; name: string; category: string; unitCost: number };
type PricingSettings = { energyRate: number; defaultPowerWatts: number; laborRate: number; monthlyRent: number; monthlySubscriptions: number; monthlyMaintenance: number; monthlyOtherCosts: number; monthlyPieces: number; defaultMarkup: number; defaultLossRate: number };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };
type CustomExtra = { id: string; name: string; unitCost: number };
type CustomerLead = { id: string; name: string };
// Formato salvo em Quote.snapshotJson — precisa bater com o que saveQuote()
// grava, senão "Carregar no Editor" não restaura tudo exatamente como foi
// criado.
type QuoteSnapshot = {
  material?: Material;
  printer?: Printer;
  weightGrams?: number;
  hours?: string;
  minutes?: string;
  prep?: string;
  cleanup?: string;
  laborRate?: string;
  energyRate?: string;
  power?: string;
  maintenancePerHour?: string;
  markup?: string;
  lossRate?: string;
  discount?: string;
  supplies?: { id: string; name: string; quantity: number; unitCost: number }[];
  customExtras?: CustomExtra[];
  calculations?: Record<string, number>;
  marketplace?: Marketplace;
  settings?: PricingSettings;
  pricingMethod?: PricingMethod;
};

const demoMaterials: Material[] = [{ id: "pla", name: "Filamento PLA Premium F3D 1,75mm, 1kg, Vermelho", type: "PLA", unitPrice: 109, unitWeightGrams: 1000, costPerKg: 109 }, { id: "petg", name: "Filamento PETG 1,75mm 1kg Impressão 3D", type: "PETG", unitPrice: 99.9, unitWeightGrams: 1000, costPerKg: 99.9 }];
const demoPrinters: Printer[] = [{ id: "a1", model: "Bambu Lab A1 - Combo", purchasePrice: 4607, powerWatts: 220, usefulLifeHours: 6000, maintenancePerHour: 0.77 }];
const demoSupplies: Supply[] = [{ id: "bag", name: "Embalagem simples", category: "Embalagem & Caixas", unitCost: 0.35 }];
const defaultSettings: PricingSettings = { energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60, defaultMarkup: 40, defaultLossRate: 5 };
const defaultMarketplace: Marketplace = { id: "direct", name: "Venda Direta", commissionRate: 0, fixedFee: 0, adsRate: 0 };
const wattPresets = [60, 150, 160, 220];
const markupPresets = ["50", "65", "100", "150", "200"];
// Mesma paleta do site de referência para os 6 blocos de custo, na ordem
// Filamento, Depreciação, Mão de Obra (coluna 1) / Energia, Insumos, Reserva
// Perdas (coluna 2) — usada tanto nos pontos da legenda quanto na barra.
const legendColors = ["#602f32", "#777f5d", "#8a4a4e", "#d1a94a", "#f4bbd3", "#e8ddd7"];

const n = (value: string) => {
  const cleanValue = value.replace(/R\$\s?/g, "").replace(/\s/g, "");
  const normalized = cleanValue.includes(",") ? cleanValue.replace(/\./g, "").replace(",", ".") : cleanValue;
  return Number(normalized) || 0;
};
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl3 = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const currencyInput = (value: string) => (n(value) ? brl(n(value)) : "");
const editingCurrency = (value: string) => value.replace(/^R\$\s?/, "");
const categoryTag = (category: string) => category.split(/[\s&]/)[0]?.toUpperCase() ?? category.toUpperCase();

export default function CalculatorPage() {
  return (
    <Suspense fallback={null}>
      <CalculatorForm />
    </Suspense>
  );
}

// useSearchParams() (para restaurar um orçamento salvo via ?quoteId=) exige
// um limite de Suspense acima — daí o componente estar separado do default export.
function CalculatorForm() {
  const [materials, setMaterials] = useState<Material[]>(demoMaterials);
  const [printers, setPrinters] = useState<Printer[]>(demoPrinters);
  const [supplies, setSupplies] = useState<Supply[]>(demoSupplies);
  const [settings, setSettings] = useState<PricingSettings>(defaultSettings);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([defaultMarketplace]);
  const [materialId, setMaterialId] = useState("");
  const [printerId, setPrinterId] = useState("a1");
  const [name, setName] = useState("Porta Guardanapos Árvore de Natal");
  const [client, setClient] = useState("");
  const [customers, setCustomers] = useState<CustomerLead[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [weight, setWeight] = useState("19,9");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("51");
  const [prep, setPrep] = useState("5");
  const [cleanup, setCleanup] = useState("5");
  const [laborRate, setLaborRate] = useState("25");
  const [energyRate, setEnergyRate] = useState("0,85");
  const [markup, setMarkup] = useState("40");
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>("markup");
  const [lossRate, setLossRate] = useState("5");
  const [marketplaceId, setMarketplaceId] = useState("direct");
  const [discount, setDiscount] = useState("0");
  const [power, setPower] = useState("220");
  const [maintenancePerHour, setMaintenancePerHour] = useState("0,77");
  const [selected, setSelected] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [customExtras, setCustomExtras] = useState<CustomExtra[]>([]);
  const [customExtraName, setCustomExtraName] = useState("");
  const [customExtraCost, setCustomExtraCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  // Total de custos fixos do mês corrente, se já lançado em /costs; senão usa
  // a soma dos 4 campos antigos de PricingSettings (fallback abaixo).
  const [currentMonthFixedCost, setCurrentMonthFixedCost] = useState<number | null>(null);

  const searchParams = useSearchParams();
  // Vindo de "Carregar no Editor"/"Abrir na calculadora" (?quoteId=...): os
  // valores do orçamento salvo têm que prevalecer sobre os padrões globais.
  // Sem id na URL (ex: clicou em "Calculadora" no menu) a calculadora abre
  // em branco/com os padrões, como sempre.
  const quoteId = searchParams.get("quoteId");
  // Vindo do Catálogo (?productId=...): produto não passa pela calculadora
  // pra ser criado (usa outro motor de custo, multi-material, sem
  // impressora/energia/mão de obra detalhados) — então só dá pra restaurar
  // nome, peso, tempo e o primeiro material; o resto fica no padrão global.
  const productId = searchParams.get("productId");

  useEffect(() => {
    async function load() {
      // Mês local, não UTC — perto da meia-noite no Brasil toISOString() já mostraria o mês seguinte.
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const responses = await Promise.all([fetch("/api/materials"), fetch("/api/printers"), fetch("/api/supplies"), fetch("/api/settings"), fetch("/api/marketplaces"), fetch("/api/costs/fixed"), fetch("/api/customers")]);
      if (responses[0].ok) { const data = (await responses[0].json()) as Material[]; if (data.length) setMaterials(data); }
      if (responses[1].ok) {
        const data = (await responses[1].json()) as Printer[];
        if (data.length) {
          setPrinters(data);
          if (!quoteId) { setPrinterId(data[0].id); setMaintenancePerHour(String(data[0].maintenancePerHour).replace(".", ",")); }
        }
      }
      if (responses[2].ok) { const data = (await responses[2].json()) as Supply[]; if (data.length) setSupplies(data); }
      if (responses[3].ok) {
        const data = (await responses[3].json()) as PricingSettings;
        setSettings(data);
        if (!quoteId) { setLaborRate(String(data.laborRate).replace(".", ",")); setEnergyRate(String(data.energyRate).replace(".", ",")); setMarkup(String(data.defaultMarkup)); setLossRate(String(data.defaultLossRate)); setPower(String(data.defaultPowerWatts)); }
      }
      // "Venda Direta" (0% de taxas) fica sempre disponível — antes, se você já
      // tivesse canais cadastrados em Configurações, ela desaparecia da lista.
      if (responses[4].ok) { const data = (await responses[4].json()) as Marketplace[]; setMarketplaces([defaultMarketplace, ...data]); }
      if (responses[5].ok) {
        const data = (await responses[5].json()) as { month: string; total: number }[];
        setCurrentMonthFixedCost(data.find((item) => item.month === month)?.total ?? null);
      }
      if (responses[6].ok) setCustomers((await responses[6].json()) as CustomerLead[]);
    }
    void load();
  }, [quoteId]);

  useEffect(() => {
    if (!quoteId) return;
    async function loadQuote() {
      const response = await fetch(`/api/quotes/${quoteId}`);
      if (!response.ok) return;
      const quote = (await response.json()) as { productName: string; customerName: string; notes: string; snapshotJson: string };
      setName(quote.productName);
      setClient(quote.customerName);
      setNotes(quote.notes);
      let s: QuoteSnapshot = {};
      try { s = JSON.parse(quote.snapshotJson) as QuoteSnapshot; } catch { s = {}; }
      if (s.material?.id) setMaterialId(s.material.id);
      if (s.printer?.id) setPrinterId(s.printer.id);
      if (typeof s.weightGrams === "number") setWeight(String(s.weightGrams).replace(".", ","));
      if (s.hours !== undefined) setHours(s.hours);
      if (s.minutes !== undefined) setMinutes(s.minutes);
      if (s.prep !== undefined) setPrep(s.prep);
      if (s.cleanup !== undefined) setCleanup(s.cleanup);
      if (s.laborRate !== undefined) setLaborRate(s.laborRate);
      if (s.energyRate !== undefined) setEnergyRate(s.energyRate);
      if (s.power !== undefined) setPower(s.power);
      if (s.maintenancePerHour !== undefined) setMaintenancePerHour(s.maintenancePerHour);
      if (s.markup !== undefined) setMarkup(s.markup);
      if (s.lossRate !== undefined) setLossRate(s.lossRate);
      if (s.discount !== undefined) setDiscount(s.discount);
      if (s.marketplace?.id) setMarketplaceId(s.marketplace.id);
      if (s.pricingMethod) setPricingMethod(s.pricingMethod);
      if (s.supplies) {
        setSelected(s.supplies.map((item) => item.id));
        setQuantities(Object.fromEntries(s.supplies.map((item) => [item.id, item.quantity ?? 1])));
        setPriceOverrides(Object.fromEntries(s.supplies.map((item) => [item.id, item.unitCost ?? 0])));
      }
      if (s.customExtras) setCustomExtras(s.customExtras);
    }
    void loadQuote();
  }, [quoteId]);

  useEffect(() => {
    if (!productId) return;
    async function loadProduct() {
      const response = await fetch("/api/products");
      if (!response.ok) return;
      const products = (await response.json()) as { id: string; name: string; weightGrams: number; printTimeHours: number; materials?: { materialId: string }[] }[];
      const product = products.find((item) => item.id === productId);
      if (!product) return;
      setName(product.name);
      setWeight(String(product.weightGrams).replace(".", ","));
      setHours(String(Math.floor(product.printTimeHours)));
      setMinutes(String(Math.round((product.printTimeHours % 1) * 60)));
      const firstMaterialId = product.materials?.[0]?.materialId;
      if (firstMaterialId) setMaterialId(firstMaterialId);
    }
    void loadProduct();
  }, [productId]);

  const material = materials.find((item) => item.id === materialId);
  const printer = printers.find((item) => item.id === printerId) ?? printers[0];
  const marketplace = marketplaces.find((item) => item.id === marketplaceId) ?? marketplaces[0] ?? defaultMarketplace;
  const clientSuggestions = useMemo(() => {
    const query = client.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 6);
  }, [client, customers]);

  function selectPrinter(id: string) {
    setPrinterId(id);
    const item = printers.find((p) => p.id === id);
    if (item) setMaintenancePerHour(String(item.maintenancePerHour).replace(".", ","));
  }

  const calc = useMemo(() => {
    const presetsCost = selected.reduce((sum, id) => {
      const item = supplies.find((s) => s.id === id);
      if (!item) return sum;
      const unitCost = priceOverrides[id] ?? item.unitCost;
      return sum + unitCost * (quantities[id] ?? 1);
    }, 0);
    const customCost = customExtras.reduce((sum, item) => sum + item.unitCost, 0);
    const cost = calculatePieceCost({
      weightGrams: n(weight),
      materialUnitPrice: material?.unitPrice || material?.costPerKg || 0,
      materialUnitWeightGrams: material?.unitWeightGrams || 1000,
      printTimeHours: n(hours) + n(minutes) / 60,
      prepMinutes: n(prep),
      cleanupMinutes: n(cleanup),
      laborRatePerHour: n(laborRate),
      energyRatePerKwh: n(energyRate),
      powerWatts: n(power),
      printerPurchasePrice: printer?.purchasePrice,
      printerUsefulLifeHours: printer?.usefulLifeHours,
      printerMaintenancePerHour: n(maintenancePerHour),
      suppliesCost: presetsCost + customCost,
      fixedCostPerPiece: fixedCostPerPiece(settings, currentMonthFixedCost ?? undefined),
      lossRatePercent: n(lossRate),
    });
    const pricing = calculateSuggestedPrice({
      unitCost: cost.total,
      markupPercent: n(markup),
      channel: marketplace,
      discountPerUnit: n(discount),
      method: pricingMethod,
    });
    return {
      printTime: cost.printTimeHours,
      filament: cost.filament,
      labor: cost.labor,
      energy: cost.energy,
      machine: cost.machine,
      extras: cost.supplies,
      insumosCount: selected.length + customExtras.length,
      fixedCostsPerPiece: cost.fixedCosts,
      reserve: cost.reserve,
      base: cost.base,
      costWithReserve: cost.total,
      minimumPrice: pricing.minimum,
      price: pricing.final,
      profit: pricing.final - cost.total,
    };
  }, [cleanup, currentMonthFixedCost, customExtras, discount, energyRate, hours, laborRate, lossRate, maintenancePerHour, markup, marketplace, material, minutes, power, prep, pricingMethod, priceOverrides, printer, quantities, selected, settings, supplies, weight]);

  const filamentUnitCost = material?.unitPrice || material?.costPerKg || 0;
  const filamentPerGram = filamentUnitCost / (material?.unitWeightGrams || 1000);
  const depreciationPerHour = printer ? printer.purchasePrice / printer.usefulLifeHours : 0;
  const machineCostPerHour = depreciationPerHour + n(maintenancePerHour);
  const energyKwh = (n(power) / 1000) * calc.printTime;
  const quickChannels = marketplaces.slice(0, 4);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setQuantities((current) => ({ ...current, [id]: current[id] ?? 1 }));
  }
  function updateQuantity(id: string, delta: number) {
    setQuantities((current) => ({ ...current, [id]: Math.max(1, (current[id] ?? 1) + delta) }));
  }
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
  async function saveQuote(): Promise<{ id: string } | null> {
    // Nome dos insumos vai junto no snapshot (não só o id) — o orçamento em
    // PDF (src/app/quotes/[id]/print) lista "o que está incluso" sem precisar
    // reconsultar a Biblioteca, que pode ter mudado ou perdido o preset depois.
    const snapshot: QuoteSnapshot = {
      material,
      printer,
      weightGrams: n(weight),
      hours,
      minutes,
      prep,
      cleanup,
      laborRate,
      energyRate,
      power,
      maintenancePerHour,
      markup,
      lossRate,
      discount,
      supplies: selected.map((id) => ({
        id,
        name: supplies.find((item) => item.id === id)?.name ?? "",
        quantity: quantities[id] ?? 1,
        unitCost: priceOverrides[id] ?? supplies.find((item) => item.id === id)?.unitCost ?? 0,
      })),
      customExtras,
      calculations: calc,
      marketplace,
      settings,
      pricingMethod,
    };
    const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: name, customerName: client, status: "DRAFT", baseCost: calc.costWithReserve, finalPrice: calc.price, margin: calc.profit, snapshot, notes }) });
    localStorage.setItem("minima3d-project", JSON.stringify({ name, client, price: calc.price, notes, snapshot }));
    if (!response.ok) return null;
    return (await response.json()) as { id: string };
  }
  async function save() {
    const result = await saveQuote();
    setSaved(Boolean(result));
    window.setTimeout(() => setSaved(false), 2500);
  }
  async function generateReport() {
    const result = await saveQuote();
    if (!result) { setSaved(false); return; }
    window.open(`/quotes/${result.id}/print`, "_blank");
  }

  const realMarginPercent = calc.price ? (calc.profit / calc.price) * 100 : 0;
  const costSegments = [
    { label: "Filamento", value: calc.filament, color: legendColors[0] },
    { label: "Depreciação", value: calc.machine, color: legendColors[1] },
    { label: "Mão de Obra", value: calc.labor, color: legendColors[2] },
    { label: "Energia", value: calc.energy, color: legendColors[3] },
    { label: "Insumos", value: calc.extras, color: legendColors[4] },
    { label: "Reserva Perdas", value: calc.reserve, color: legendColors[5] },
  ];
  const costSegmentsTotal = costSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <main className="calculator-shell">
      <AdminHeader active="calculator" />
      <div className="calculator-content">
        <section className="project-header">
          <label><span>NOME DO ORÇAMENTO (PRODUTO / KIT / VARIAÇÃO)</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="client-field">
            <span>NOME DO CLIENTE (OPCIONAL)</span>
            <input
              value={client}
              onChange={(event) => { setClient(event.target.value); setClientSuggestionsOpen(true); }}
              onFocus={() => setClientSuggestionsOpen(true)}
              onBlur={() => setClientSuggestionsOpen(false)}
              placeholder="Ex: João Silva - Orçamento #102"
              autoComplete="off"
            />
            {clientSuggestionsOpen && clientSuggestions.length > 0 ? (
              <ul className="client-suggestions">
                {clientSuggestions.map((item) => (
                  <li key={item.id}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setClient(item.name); setClientSuggestionsOpen(false); }}>
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <button className="quiet-button" onClick={() => { setName(""); setClient(""); setWeight(""); setNotes(""); }}>↻ Limpar Campos</button>
        </section>

        <div className="calculator-grid">
          <div className="calculator-main">
            <section className="calc-section">
              <Title text="MATERIAL & FILAMENTO" />
              <div className="field-row library-row">
                <label>Selecionar da Biblioteca<select value={materialId} onChange={(event) => setMaterialId(event.target.value)}><option value="">Selecione um material...</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <a className="bookmark-link" href="/admin" title="Gerenciar presets na Biblioteca"><IconBookmark className="nav-icon" /></a>
              </div>
              <div className="field-grid three">
                <label>Nome do Filamento / Cor<input readOnly value={material?.name ?? ""} /></label>
                <label>Tipo de Material<input readOnly value={material?.type ?? "PLA"} /></label>
                <label>Peso Usado (g)<input value={weight} onChange={(event) => setWeight(event.target.value)} /><small>Peça + suportes</small></label>
              </div>
              <div className="field-grid two-one">
                <label>Preço do Rolo (1kg/R$)<input readOnly value={brl(material?.unitPrice ?? material?.costPerKg ?? 0)} /></label>
                <label>Peso Total do Rolo<input readOnly value={material?.unitWeightGrams ?? 1000} /></label>
                <div className="metric-box metric-split">
                  <div><span>Custo Calculado do Filamento</span><strong className="metric-split-rate">{brl3(filamentPerGram)}/g</strong></div>
                  <div className="metric-split-total"><span>TOTAL FILAMENTO</span><strong>{brl(calc.filament)}</strong></div>
                </div>
              </div>
            </section>

            <section className="calc-section">
              <Title text="TEMPO & MÃO DE OBRA" />
              <div className="field-grid time-grid">
                <div className="time-box">
                  <span><IconClock className="nav-icon" /> Tempo de Impressão 3D</span>
                  <div className="field-grid two"><label>Horas<input value={hours} onChange={(event) => setHours(event.target.value)} /></label><label>Minutos<input value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label></div>
                  <small>Total: {Math.floor(calc.printTime)}h {Math.round((calc.printTime % 1) * 60)}m ({calc.printTime.toFixed(2)}h decimal)</small>
                </div>
                <label>Fatiamento / Prep (min)<input value={prep} onChange={(event) => setPrep(event.target.value)} /><small>Design, fatiamento no Cura/Bambu Studio</small></label>
                <label>Limpeza / Pós-proc (min)<input value={cleanup} onChange={(event) => setCleanup(event.target.value)} /><small>Remoção de suporte, lixa, embalagem</small></label>
              </div>
              <div className="labor-strip">
                <div>
                  <span>Sua Hora de Trabalho (R$/hora)</span>
                  <small>Remuneração pelo seu tempo investido na preparação e acabamento.</small>
                </div>
                <input inputMode="decimal" value={laborRate} onFocus={(event) => setLaborRate(editingCurrency(event.target.value))} onBlur={(event) => setLaborRate(currencyInput(event.target.value))} onChange={(event) => setLaborRate(event.target.value)} />
                <strong>TOTAL MÃO DE OBRA<br />{brl(calc.labor)}</strong>
              </div>
            </section>

            <section className="calc-section">
              <Title text="ENERGIA ELÉTRICA GASTA" />
              <div className="field-grid three">
                <label>
                  Consumo Médio da Impressora (Watts)
                  <input value={power} onChange={(event) => setPower(event.target.value)} />
                  <div className="chip-row">{wattPresets.map((watt) => <button type="button" key={watt} className={n(power) === watt ? "chip selected" : "chip"} onClick={() => setPower(String(watt))}>{watt}W</button>)}</div>
                </label>
                <label className="label-hint-row">
                  <span>Tarifa de Energia (R$/kWh)<em>Média BR: R$0,85</em></span>
                  <input inputMode="decimal" value={energyRate} onFocus={(event) => setEnergyRate(editingCurrency(event.target.value))} onBlur={(event) => setEnergyRate(currencyInput(event.target.value))} onChange={(event) => setEnergyRate(event.target.value)} />
                </label>
                <Metric title={`Consumo Estimado: ${energyKwh.toFixed(2)} kWh`} value={calc.energy} valueLabel="CUSTO ENERGIA" hint={`Fórmula: (${n(power)}W ÷ 1000) × ${calc.printTime.toFixed(2)}h × R$${n(energyRate).toFixed(2)}/kWh`} />
              </div>
            </section>

            <section className="calc-section">
              <Title text="DEPRECIAÇÃO & MANUTENÇÃO DA MÁQUINA" />
              <div className="field-row">
                <label>Selecionar Impressora<select value={printerId} onChange={(event) => selectPrinter(event.target.value)}>{printers.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></label>
                <a className="bookmark-link" href="/admin" title="Gerenciar presets na Biblioteca"><IconBookmark className="nav-icon" /></a>
              </div>
              <div className="field-grid three">
                <label>Nome do Equipamento<input readOnly value={printer?.model ?? ""} /></label>
                <label>Valor Pago na Máquina (R$)<input readOnly value={brl(printer?.purchasePrice ?? 0)} /></label>
                <label>Vida Útil Estimada (Horas)<input readOnly value={printer?.usefulLifeHours ?? 0} /><small>Geralmente 4.000h a 8.000h de trabalho</small></label>
              </div>
              <div className="field-grid one-two">
                <label>Manutenção/Hora (R$/h)<input inputMode="decimal" value={maintenancePerHour} onFocus={(event) => setMaintenancePerHour(editingCurrency(event.target.value))} onBlur={(event) => setMaintenancePerHour(currencyInput(event.target.value))} onChange={(event) => setMaintenancePerHour(event.target.value)} /><small>Bico, fita, PEI, lubrificante, peças</small></label>
                <div className="metric-wide">
                  <span>Custo por Hora de Funcionamento: <strong>{brl(machineCostPerHour)}/h</strong><br /><small>(Depreciação: {brl(depreciationPerHour)}/h + Manutenção: {brl(n(maintenancePerHour))}/h)</small></span>
                  <strong>DEPRECIAÇÃO NESTA PEÇA<br />{brl(calc.machine)}</strong>
                </div>
              </div>
            </section>

            <section className="calc-section">
              <div className="section-heading-row"><Title text="INSUMOS & ACESSÓRIOS ADICIONAIS" /><span className="section-total">TOTAL INSUMOS <strong>{brl(calc.extras)}</strong></span></div>
              <span className="supply-list-label"><IconSparkles className="nav-icon" /> Adicionar Insumo Rápido da Lista:</span>
              <div className="supply-list">
                {supplies.map((item) => {
                  const quantity = quantities[item.id] ?? 1;
                  const isSelected = selected.includes(item.id);
                  const unitCost = priceOverrides[item.id] ?? item.unitCost;
                  return (
                    <div className={isSelected ? "supply-row selected" : "supply-row"} key={item.id}>
                      <button type="button" className="supply-name" onClick={() => toggle(item.id)}>
                        <span className="supply-tag">{categoryTag(item.category)}</span>
                        {item.name}
                      </button>
                      {isSelected ? (
                        <>
                          <input className="supply-price" inputMode="decimal" value={unitCost} onChange={(event) => setPriceOverrides((current) => ({ ...current, [item.id]: n(event.target.value) }))} />
                          <span className="quantity-control"><button type="button" onClick={() => updateQuantity(item.id, -1)}>-</button><b>{quantity}</b><button type="button" onClick={() => updateQuantity(item.id, 1)}>+</button></span>
                          <strong>{brl(unitCost * quantity)}</strong>
                          <button type="button" className="row-trash" onClick={() => toggle(item.id)} aria-label={`Remover ${item.name}`}><IconTrash className="nav-icon" /></button>
                        </>
                      ) : (
                        <strong className="supply-static-price">{brl(item.unitCost)}</strong>
                      )}
                    </div>
                  );
                })}
                {customExtras.map((item) => (
                  <div className="supply-row selected" key={item.id}>
                    <span className="supply-name supply-name-static"><span className="supply-tag">EXTRA</span>{item.name}</span>
                    <strong>{brl(item.unitCost)}</strong>
                    <button type="button" className="row-trash" onClick={() => removeCustomExtra(item.id)} aria-label={`Remover ${item.name}`}><IconTrash className="nav-icon" /></button>
                  </div>
                ))}
              </div>
              {supplies.length === 0 && customExtras.length === 0 ? <div className="empty-note">Clique nos itens da biblioteca para adicionar ao projeto.</div> : null}
              <div className="custom-extra-row">
                <span className="supply-list-label">Adicionar Outro Insumo Personalizado:</span>
                <div className="custom-extra-fields">
                  <input value={customExtraName} onChange={(event) => setCustomExtraName(event.target.value)} placeholder="Ex: Fita Cetim, Tag Personalizada..." />
                  <input inputMode="decimal" value={customExtraCost} onChange={(event) => setCustomExtraCost(event.target.value)} placeholder="R$ 0,00" />
                  <button type="button" className="secondary-button" onClick={addCustomExtra} disabled={!customExtraName.trim() || !n(customExtraCost)}>+ Adicionar</button>
                </div>
              </div>
            </section>

            <section className="calc-section">
              <Title text="MARGEM DE LUCRO & TAXAS" />
              <div className="margin-panel">
                <div className="margin-panel-head"><span>MARGEM DE LUCRO DESEJADA</span><span className="margin-method-badge">{pricingMethod === "markup" ? "Markup" : "Margem Real"}</span></div>
                <div className="margin-panel-value"><strong>{markup}%</strong></div>
                <input type="range" min="0" max="200" value={markup} onChange={(event) => setMarkup(event.target.value)} />
                <div className="range-presets">{markupPresets.map((value) => <button type="button" key={value} onClick={() => setMarkup(value)}>{value}%</button>)}</div>
              </div>
              <div className="field-grid three pricing-options">
                <label>
                  Método de Precificação
                  <span className="method-toggle">
                    <button type="button" className={pricingMethod === "markup" ? "selected" : ""} onClick={() => setPricingMethod("markup")}>Markup</button>
                    <button type="button" className={pricingMethod === "margin" ? "selected" : ""} onClick={() => setPricingMethod("margin")}>Margem Real</button>
                  </span>
                  <small>{pricingMethod === "markup" ? "Markup multiplica seu custo total pela %." : "Margem Real garante que o lucro seja essa % do preço final."}</small>
                </label>
                <label className="label-hint-row">
                  <span><span className="label-icon-text"><IconShieldAlert className="nav-icon" /> Margem para Perdas (%)</span><em>Padrão: 5%</em></span>
                  <input value={lossRate} onChange={(event) => setLossRate(event.target.value)} />
                  <small>Reserva para peças com falhas ou testes</small>
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
          </div>

          <aside className="price-summary">
            <span className="summary-eyebrow">PREÇO FINAL SUGERIDO</span>
            <h2>{brl(calc.price)}</h2>
            <button className="saved-tag" onClick={save}><IconSave className="nav-icon" /> {saved ? "Salvo" : "Salvar"}</button>
            <hr />
            <div className="summary-title"><span>Composição de Custos</span><strong>Custo Total: {brl(calc.costWithReserve)}</strong></div>
            <div className="cost-bar">
              {costSegments.map((segment) => (
                <i key={segment.label} title={`${segment.label}: ${brl(segment.value)}`} style={{ width: `${(segment.value / costSegmentsTotal) * 100}%`, background: segment.color }} />
              ))}
            </div>
            <div className="summary-columns">
              <div>
                <Cost label="Filamento" value={calc.filament} dot={legendColors[0]} />
                <Cost label="Depreciação" value={calc.machine} dot={legendColors[1]} />
                <Cost label="Mão de Obra" value={calc.labor} dot={legendColors[2]} />
              </div>
              <div>
                <Cost label="Energia" value={calc.energy} dot={legendColors[3]} />
                <Cost label="Insumos" value={calc.extras} dot={legendColors[4]} />
                <Cost label="Reserva Perdas" value={calc.reserve} dot={legendColors[5]} />
              </div>
            </div>
            <div className="summary-card">
              <Cost label="Filamento" value={calc.filament} />
              <Cost label="Energia" value={calc.energy} />
              <Cost label="Depreciação + Manut." value={calc.machine} />
              <Cost label="Mão de Obra" value={calc.labor} />
              <Cost label={`Insumos (${calc.insumosCount})`} value={calc.extras} />
              <Cost label="Custos Fixos Rateados" value={calc.fixedCostsPerPiece} />
              <Cost label="Reserva para perdas" value={calc.reserve} />
              <hr />
              <Cost label="Custo Base" value={calc.costWithReserve} bold />
            </div>
            <div className="profit-grid">
              <div><span>LUCRO ESTIMADO</span><strong>+{brl(calc.profit)}</strong><small>{marketplace.name} · Margem Real: {realMarginPercent.toFixed(1)}%</small></div>
              <div><span>PREÇO ATACADO</span><strong>{brl(calc.price * 0.85)}</strong><small>Desconto por volume</small></div>
            </div>
            <button className="report-button" onClick={generateReport}><IconDownload className="nav-icon" /> Gerar Orçamento em PDF</button>
            <button className="whatsapp-button" onClick={() => navigator.clipboard?.writeText(`Orçamento: ${name}\nValor: ${brl(calc.price)}\n\nQualquer dúvida, estou à disposição!`)}><IconCopy className="nav-icon" /> Copiar Resumo para WhatsApp</button>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Title({ text }: { text: string }) { return <div className="section-title"><span />{text}</div>; }
function Metric({ title, value, valueLabel, hint }: { title: string; value: number; valueLabel?: string; hint?: string }) {
  return (
    <div className="metric-box">
      <span>{title}</span>
      {valueLabel ? <small className="metric-value-label">{valueLabel}</small> : null}
      <strong>{brl(value)}</strong>
      <small>{hint ?? "Custo calculado"}</small>
    </div>
  );
}
function Cost({ label, value, bold = false, dot }: { label: string; value: number; bold?: boolean; dot?: string }) {
  return (
    <div className={bold ? "cost-line bold" : "cost-line"}>
      <span>{dot ? <i className="cost-dot" style={{ background: dot }} /> : null}{label}</span>
      <strong>{brl(value)}</strong>
    </div>
  );
}
