"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminHeader } from "@/components/AdminHeader";
import { IconBookmark, IconChevronDown, IconChevronUp, IconClock, IconCopy, IconDownload, IconSave, IconShoppingBag, IconTrash } from "@/components/Icons";
import { calculateSuggestedPrice, type PricingMethod } from "@/lib/costing";

// Produto já cadastrado no Catálogo — custo e tempo de impressão vêm prontos
// de lá (calculados com o motor multi-material do Catálogo), então aqui só
// usamos os valores finais, sem recalcular nada.
type Product = { id: string; name: string; sku: string; category: string; cost: number; printTimeHours: number; imageUrl?: string };
type Supply = { id: string; name: string; category: string; unitCost: number };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };
type CustomExtra = { id: string; name: string; unitCost: number };
type CustomerLead = { id: string; name: string };
type ProductLine = { productId: string; quantity: string };
type SupplyLine = { supplyId: string; quantity: string; unitCost: string };
// Formato salvo em Quote.snapshotJson — precisa bater com o que saveQuote()
// grava, senão "Carregar no Editor" não restaura tudo exatamente como foi
// criado.
type QuoteSnapshot = {
  products?: { id: string; name: string; quantity: number; unitCost: number; printTimeHours: number; imageUrl?: string }[];
  markup?: string;
  discount?: string;
  supplies?: { id: string; name: string; quantity: number; unitCost: number }[];
  customExtras?: CustomExtra[];
  calculations?: Record<string, number>;
  marketplace?: Marketplace;
  pricingMethod?: PricingMethod;
};

const demoSupplies: Supply[] = [{ id: "bag", name: "Embalagem simples", category: "Embalagem & Caixas", unitCost: 0.35 }];
const defaultMarketplace: Marketplace = { id: "direct", name: "Venda Direta", commissionRate: 0, fixedFee: 0, adsRate: 0 };
const markupPresets = ["10", "25", "50", "65", "100", "150", "200"];
// Mesma paleta do site de referência para os blocos de custo — usada tanto
// nos pontos da legenda quanto na barra proporcional.
const legendColors = ["#602f32", "#777f5d", "#8a4a4e", "#d1a94a", "#f4bbd3", "#e8ddd7"];

const n = (value: string) => {
  const cleanValue = value.replace(/R\$\s?/g, "").replace(/\s/g, "");
  const normalized = cleanValue.includes(",") ? cleanValue.replace(/\./g, "").replace(",", ".") : cleanValue;
  return Number(normalized) || 0;
};
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHours = (hours: number) => `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;

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
  const [supplies, setSupplies] = useState<Supply[]>(demoSupplies);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([defaultMarketplace]);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([]);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [customers, setCustomers] = useState<CustomerLead[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [markup, setMarkup] = useState("40");
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>("markup");
  const [marketplaceId, setMarketplaceId] = useState("direct");
  const [discount, setDiscount] = useState("0");
  const [customExtras, setCustomExtras] = useState<CustomExtra[]>([]);
  const [customExtraName, setCustomExtraName] = useState("");
  const [customExtraCost, setCustomExtraCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [reportError, setReportError] = useState("");

  const searchParams = useSearchParams();
  // Vindo de "Carregar no Editor" (?quoteId=...): os valores do orçamento
  // salvo têm que prevalecer sobre os padrões globais. Sem id na URL (ex:
  // clicou em "Orçamentos" no menu) a tela abre em branco/com os padrões.
  const quoteId = searchParams.get("quoteId");
  // Vindo do Catálogo (?productId=...): já entra com esse produto adicionado
  // como primeira linha.
  const productId = searchParams.get("productId");

  useEffect(() => {
    async function load() {
      const responses = await Promise.all([fetch("/api/products"), fetch("/api/supplies"), fetch("/api/settings"), fetch("/api/marketplaces"), fetch("/api/customers")]);
      if (responses[0].ok) setProducts((await responses[0].json()) as Product[]);
      if (responses[1].ok) { const data = (await responses[1].json()) as Supply[]; if (data.length) setSupplies(data); }
      if (responses[2].ok) {
        const data = (await responses[2].json()) as { defaultMarkup: number };
        if (!quoteId) setMarkup(String(data.defaultMarkup));
      }
      // "Venda Direta" (0% de taxas) fica sempre disponível — antes, se você já
      // tivesse canais cadastrados em Configurações, ela desaparecia da lista.
      if (responses[3].ok) { const data = (await responses[3].json()) as Marketplace[]; setMarketplaces([defaultMarketplace, ...data]); }
      if (responses[4].ok) setCustomers((await responses[4].json()) as CustomerLead[]);
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
      if (s.products) setProductLines(s.products.map((item) => ({ productId: item.id, quantity: String(item.quantity ?? 1) })));
      if (s.markup !== undefined) setMarkup(s.markup);
      if (s.discount !== undefined) setDiscount(s.discount);
      if (s.marketplace?.id) setMarketplaceId(s.marketplace.id);
      if (s.pricingMethod) setPricingMethod(s.pricingMethod);
      if (s.supplies) {
        setSupplyLines(s.supplies.map((item) => ({ supplyId: item.id, quantity: String(item.quantity ?? 1), unitCost: String(item.unitCost ?? 0).replace(".", ",") })));
      }
      if (s.customExtras) setCustomExtras(s.customExtras);
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

  function addProductLine() {
    const usedIds = new Set(productLines.map((line) => line.productId));
    const next = products.find((item) => !usedIds.has(item.id));
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

  const productLinesWithData = useMemo(
    () => productLines
      .map((line) => ({ line, product: products.find((item) => item.id === line.productId) }))
      .filter((entry): entry is { line: ProductLine; product: Product } => Boolean(entry.product)),
    [productLines, products],
  );

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

  const calc = useMemo(() => {
    const productsCost = productLinesWithData.reduce((sum, entry) => sum + entry.product.cost * (n(entry.line.quantity) || 1), 0);
    const productsPrintTime = productLinesWithData.reduce((sum, entry) => sum + entry.product.printTimeHours * (n(entry.line.quantity) || 1), 0);
    const presetsCost = supplyLinesWithData.reduce((sum, entry) => sum + (n(entry.line.unitCost) || entry.supply.unitCost) * (n(entry.line.quantity) || 1), 0);
    const customCost = customExtras.reduce((sum, item) => sum + item.unitCost, 0);
    const suppliesCost = presetsCost + customCost;
    // Sem reserva para perdas aqui — cada produto do catálogo já embute o
    // próprio risco de falha/refugo no custo dele, calculado lá na origem.
    const costWithReserve = productsCost + suppliesCost;
    const pricing = calculateSuggestedPrice({
      unitCost: costWithReserve,
      markupPercent: n(markup),
      channel: marketplace,
      discountPerUnit: n(discount),
      method: pricingMethod,
    });
    return {
      printTime: productsPrintTime,
      productsCost,
      suppliesCost,
      insumosCount: supplyLinesWithData.length + customExtras.length,
      costWithReserve,
      minimumPrice: pricing.minimum,
      price: pricing.final,
      profit: pricing.final - costWithReserve,
    };
  }, [customExtras, discount, markup, marketplace, pricingMethod, productLinesWithData, supplyLinesWithData]);

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
  async function saveQuote(): Promise<{ id: string } | null> {
    // Nome dos insumos vai junto no snapshot (não só o id) — o orçamento em
    // PDF (src/app/quotes/[id]/print) lista "o que está incluso" sem precisar
    // reconsultar a Biblioteca, que pode ter mudado ou perdido o preset depois.
    const snapshot: QuoteSnapshot = {
      products: productLinesWithData.map((entry) => ({
        id: entry.product.id,
        name: entry.product.name,
        quantity: n(entry.line.quantity) || 1,
        unitCost: entry.product.cost,
        printTimeHours: entry.product.printTimeHours,
        imageUrl: entry.product.imageUrl,
      })),
      markup,
      discount,
      supplies: supplyLinesWithData.map((entry) => ({
        id: entry.supply.id,
        name: entry.supply.name,
        quantity: n(entry.line.quantity) || 1,
        unitCost: n(entry.line.unitCost) || entry.supply.unitCost,
      })),
      customExtras,
      calculations: calc,
      marketplace,
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
    if (!name.trim()) {
      setReportError("Preencha o nome do orçamento antes de gerar o PDF.");
      window.setTimeout(() => setReportError(""), 3500);
      return;
    }
    setReportError("");
    // Abre a aba já no clique (síncrono) pra não ser bloqueada como pop-up:
    // navegadores permitem window.open só durante o gesto do usuário, e o
    // await do saveQuote() logo abaixo já tira a chamada desse contexto.
    const win = window.open("", "_blank");
    const result = await saveQuote();
    if (!result) {
      win?.close();
      setSaved(false);
      setReportError("Não foi possível salvar o orçamento. Tente novamente.");
      window.setTimeout(() => setReportError(""), 3500);
      return;
    }
    if (win) win.location.href = `/quotes/${result.id}/print`;
    else window.open(`/quotes/${result.id}/print`, "_blank");
  }

  const realMarginPercent = calc.price ? (calc.profit / calc.price) * 100 : 0;
  const costSegments = [
    { label: "Produtos", value: calc.productsCost, color: legendColors[0] },
    { label: "Insumos", value: calc.suppliesCost, color: legendColors[4] },
  ];
  const costSegmentsTotal = costSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <main className="calculator-shell">
      <AdminHeader active="orcamentos" />
      <div className="calculator-content">
        <section className="project-header">
          <label><span>NOME DO ORÇAMENTO (PRODUTO / KIT / VARIAÇÃO) *</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Porta Guardanapos Árvore de Natal" /></label>
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
          <button className="quiet-button" onClick={() => { setName(""); setClient(""); setNotes(""); setProductLines([]); }}>↻ Limpar Campos</button>
        </section>

        <div className="calculator-grid">
          <div className="calculator-main">
            <section className="calc-section">
              <div className="section-heading-row"><Title text="PRODUTOS DO CATÁLOGO" /><span className="section-total">TOTAL PRODUTOS <strong>{brl(calc.productsCost)}</strong></span></div>
              <div className="field-row library-row">
                <span className="material-lines-label">Adicione um ou mais produtos já cadastrados no Catálogo para montar este orçamento.</span>
                <a className="bookmark-link" href="/catalog" title="Gerenciar produtos no Catálogo"><IconBookmark className="nav-icon" /></a>
              </div>
              <div className="material-lines">
                {productLines.length ? (
                  <div className="material-line material-line-header product-line">
                    <span />
                    <span>Produto (do Catálogo)</span>
                    <span>Tempo · Custo</span>
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
                          // eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso
                          <img src={product.imageUrl} alt={product.name} />
                        ) : (
                          <span>{product?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
                        )}
                      </div>
                      <select value={line.productId} onChange={(event) => updateProductLine(index, { productId: event.target.value })}>
                        <option value="">Selecione um produto...</option>
                        {products
                          .filter((item) => item.id === line.productId || !productLines.some((other, otherIndex) => otherIndex !== index && other.productId === item.id))
                          .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      {product ? (
                        <small className="product-line-info" title={`${fmtHours(product.printTimeHours * quantity)} de impressão · ${brl(product.cost * quantity)}${quantity > 1 ? ` (${quantity}x ${brl(product.cost)} cada)` : ""}`}>
                          <IconClock className="nav-icon" /> {fmtHours(product.printTimeHours * quantity)} · {brl(product.cost * quantity)}
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
              </div>
              {products.length === 0 ? <div className="empty-note">Nenhum produto cadastrado no Catálogo ainda.</div> : null}
              <div className="material-lines-actions">
                <button type="button" className="secondary-button" onClick={addProductLine} disabled={!products.length || productLines.length >= products.length}>+ Adicionar produto</button>
              </div>
              {productLines.length ? (
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
                    <strong>{markup}%</strong>
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
          </div>

          <div className="price-summary-col">
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
                <Cost label="Produtos" value={calc.productsCost} dot={legendColors[0]} />
                <Cost label="Insumos" value={calc.suppliesCost} dot={legendColors[4]} />
              </div>
            </div>
            <div className="summary-card">
              <Cost label="Produtos do Catálogo" value={calc.productsCost} />
              <Info label="Tempo Total de Impressão" value={fmtHours(calc.printTime)} />
              <Cost label={`Insumos (${calc.insumosCount})`} value={calc.suppliesCost} />
              <hr />
              <Cost label="Custo Base" value={calc.costWithReserve} bold subtotal />
            </div>
            <div className="summary-card">
              <Info label="Método de Precificação" value={pricingMethod === "markup" ? "Markup" : "Margem Real"} />
              <Info label="% Aplicado" value={`${markup}%`} />
              <Info label="Canal de Venda" value={marketplace.name} />
              <Info label="Comissão do Canal" value={`${(marketplace.commissionRate * 100).toFixed(1)}%`} />
              <Info label="Ads do Canal" value={`${(marketplace.adsRate * 100).toFixed(1)}%`} />
              <Info label="Taxa Fixa do Canal" value={brl(marketplace.fixedFee)} />
              {n(discount) > 0 ? <Info label="Desconto Especial" value={brl(n(discount))} /> : null}
              <hr />
              <Cost label="Margem de Lucro & Taxas" value={calc.profit} bold subtotal />
            </div>
            <div className="profit-grid">
              <div><span>LUCRO ESTIMADO</span><strong>+{brl(calc.profit)}</strong><small>{marketplace.name} · Margem Real: {realMarginPercent.toFixed(1)}%</small></div>
              <div><span>PREÇO ATACADO</span><strong>{brl(calc.price * 0.85)}</strong><small>Desconto por volume</small></div>
            </div>
            <button className="report-button" onClick={generateReport}><IconDownload className="nav-icon" /> Gerar Orçamento em PDF</button>
            <button className="whatsapp-button" onClick={() => navigator.clipboard?.writeText(`Orçamento: ${name}\nValor: ${brl(calc.price)}\n\nQualquer dúvida, estou à disposição!`)}><IconCopy className="nav-icon" /> Copiar Resumo para WhatsApp</button>
          </aside>
          {reportError ? <p className="admin-feedback feedback-error report-error">{reportError}</p> : null}
          </div>
        </div>
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
