"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconBookmark, IconTrash } from "@/components/Icons";
import { calculateMultiMaterialCost, calculatePieceCost, calculateSuggestedPrice, fixedCostPerPiece } from "@/lib/costing";
import { resizeImage } from "@/lib/image";

type Material = { id: string; name: string; type: string; unitPrice: number; unitWeightGrams: number; costPerKg: number };
type MaterialLine = { materialId: string; grams: number };
type Printer = { id: string; model: string; purchasePrice: number; powerWatts: number; usefulLifeHours: number; maintenancePerHour: number };
type PricingSettings = { energyRate: number; defaultPowerWatts: number; laborRate: number; defaultMarkup: number; defaultLossRate: number; monthlyRent: number; monthlySubscriptions: number; monthlyMaintenance: number; monthlyOtherCosts: number; monthlyPieces: number };
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
  active: boolean;
  materials: MaterialLine[];
};

type Draft = {
  name: string;
  category: string;
  description: string;
  imageUrl: string;
  materialLines: MaterialLine[];
  hours: string;
  minutes: string;
  prep: string;
  cleanup: string;
  printerId: string;
  profitMargin: string;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  category: "Decoração",
  description: "",
  imageUrl: "",
  materialLines: [],
  hours: "0",
  minutes: "0",
  prep: "5",
  cleanup: "5",
  printerId: "",
  profitMargin: "40",
  active: true,
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;

export default function CatalogNewPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [settings, setSettings] = useState<PricingSettings>({ energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, defaultMarkup: 40, defaultLossRate: 5, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60 });
  const [currentMonthFixedCost, setCurrentMonthFixedCost] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "form">("list");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [imageError, setImageError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [productRes, materialRes, printerRes, settingsRes, fixedRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/materials"),
        fetch("/api/printers"),
        fetch("/api/settings"),
        fetch("/api/costs/fixed"),
      ]);
      if (productRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (productRes.ok) setProducts((await productRes.json()) as Product[]);
      if (materialRes.ok) setMaterials((await materialRes.json()) as Material[]);
      if (printerRes.ok) setPrinters((await printerRes.json()) as Printer[]);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as PricingSettings);
      if (fixedRes.ok) {
        const data = (await fixedRes.json()) as { month: string; total: number }[];
        setCurrentMonthFixedCost(data.find((item) => item.month === month)?.total ?? null);
      }
    }
    void load();
  }, [reloadToken]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((product) => product.category)))], [products]);
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          `${product.sku} ${product.name}`.toLowerCase().includes(search.toLowerCase()) &&
          (category === "all" || product.category === category),
      ),
    [category, products, search],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const materialLinesWithData = draft.materialLines
    .map((line) => ({ line, material: materials.find((item) => item.id === line.materialId) }))
    .filter((entry): entry is { line: MaterialLine; material: Material } => Boolean(entry.material));
  const materialCost = calculateMultiMaterialCost(materialLinesWithData.map((entry) => ({ grams: entry.line.grams, material: entry.material })));
  const totalWeightGrams = materialLinesWithData.reduce((sum, entry) => sum + entry.line.grams, 0);
  const printTimeHours = n(draft.hours) + n(draft.minutes) / 60;
  const printer = printers.find((item) => item.id === draft.printerId);

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
      }),
    [materialCost, totalWeightGrams, printTimeHours, draft.prep, draft.cleanup, settings, printer, currentMonthFixedCost],
  );
  const suggestedPrice = calculateSuggestedPrice({ unitCost: cost.total, markupPercent: n(draft.profitMargin) }).suggested;

  function addMaterialLine() {
    if (!materials.length) return;
    setDraft({ ...draft, materialLines: [...draft.materialLines, { materialId: materials[0].id, grams: 0 }] });
  }
  function updateMaterialLine(index: number, patch: Partial<MaterialLine>) {
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

  function newProduct() {
    setEditingId(null);
    setDraft(emptyDraft);
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
      materialLines: product.materials?.map((line) => ({ materialId: line.materialId, grams: line.grams })) ?? [],
      hours: String(Math.floor(product.printTimeHours)),
      minutes: String(Math.round((product.printTimeHours % 1) * 60)),
      prep: String(product.prepMinutes),
      cleanup: String(product.cleanupMinutes),
      printerId: product.printerId ?? "",
      profitMargin: String(product.profitMargin),
      active: product.active,
    });
    setFeedback("");
    setView("form");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload = {
      name: draft.name,
      category: draft.category,
      description: draft.description,
      imageUrl: draft.imageUrl,
      weightGrams: totalWeightGrams,
      printTimeHours,
      prepMinutes: n(draft.prep),
      cleanupMinutes: n(draft.cleanup),
      printerId: draft.printerId || null,
      materials: draft.materialLines.filter((line) => line.grams > 0),
      materialCost: cost.filament,
      laborCost: cost.labor,
      energyCost: cost.energy,
      machineCost: cost.machine,
      overheadCost: cost.fixedCosts,
      profitMargin: n(draft.profitMargin),
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
      <AdminHeader active="catalogNew" badges={{ catalogNew: products.length }} />
      <div className="calculator-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e cadastrar produtos do catálogo." /> : null}

        {view === "list" ? (
          <>
            <section className="library-heading">
              <div>
                <h1>Catálogo Novo <span className="brand-tag">EM TESTE</span></h1>
                <p>Versão em teste do catálogo — vai substituir o Catálogo atual quando validada.</p>
              </div>
              <div className="project-tools">
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar SKU ou produto..." />
                <button type="button" className="new-quote-button" onClick={newProduct}>＋ Novo produto</button>
              </div>
            </section>

            <div className="catalog-filters">
              <strong>{filtered.length} produtos</strong>
              <div className="catalog-filters-right">
                <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                  {categories.map((item) => <option key={item} value={item}>{item === "all" ? "Todas as categorias" : item}</option>)}
                </select>
                <label className="items-per-page">Por página
                  <select value={itemsPerPage} onChange={(event) => { setItemsPerPage(Number(event.target.value)); setPage(1); }}>
                    {[10, 12, 24, 32].map((value) => <option key={value} value={value}>{value}</option>)}
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
                  </div>
                  <div className="card-top">
                    <span className="material-badge">{product.sku}</span>
                    <span className="card-actions">
                      <button className="edit-button" onClick={() => edit(product)}>Editar</button>
                      <button className="delete-button" onClick={() => archive(product.id)}><IconTrash className="nav-icon" /></button>
                    </span>
                  </div>
                  <h2>{product.name}</h2>
                  {product.description ? <p className="card-description">{product.description}</p> : null}
                  <p>{product.category} · {product.weightGrams}g · {product.printer?.model ?? "sem impressora"}</p>
                  <div className="product-card-prices">
                    <div><span>Custo</span><strong>{brl(product.cost)}</strong></div>
                    <div><span>Preço</span><strong>{brl(product.price)}</strong></div>
                  </div>
                  <p className="card-detail">Margem: {product.profitMargin}% · Impressão: {product.printTimeHours.toFixed(2)}h</p>
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
                    <label>Categoria<input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ex: Decoração, Natal..." /></label>
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
                    {draft.materialLines.map((line, index) => (
                      <div className="material-line" key={index}>
                        <select value={line.materialId} onChange={(event) => updateMaterialLine(index, { materialId: event.target.value })}>
                          {materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <input inputMode="decimal" value={line.grams} onChange={(event) => updateMaterialLine(index, { grams: n(event.target.value) })} placeholder="Gramas" />
                        <button type="button" className="delete-button" onClick={() => removeMaterialLine(index)} aria-label="Remover material"><IconTrash className="nav-icon" /></button>
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={addMaterialLine} disabled={!materials.length}>+ Adicionar material</button>
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
                  <div className="field-grid two">
                    <label>Fatiamento / Prep (min)<input inputMode="numeric" value={draft.prep} onChange={(event) => setDraft({ ...draft, prep: event.target.value })} /></label>
                    <label>Limpeza / Pós-proc (min)<input inputMode="numeric" value={draft.cleanup} onChange={(event) => setDraft({ ...draft, cleanup: event.target.value })} /></label>
                  </div>
                  <small>Um kit de vários itens impressos separadamente? Some o tempo total de todas as peças aqui — é o tempo de máquina que esse produto consome por unidade vendida.</small>
                </section>

                <section className="calc-section">
                  <Title text="IMPRESSORA" />
                  <div className="field-row library-row">
                    <label>Selecionar da Biblioteca<select value={draft.printerId} onChange={(event) => setDraft({ ...draft, printerId: event.target.value })}><option value="">Sem impressora (sem depreciação de máquina)</option>{printers.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></label>
                    <a className="bookmark-link" href="/admin" title="Gerenciar presets na Biblioteca"><IconBookmark className="nav-icon" /></a>
                  </div>
                  <small>Depreciação, manutenção e consumo de energia dessa impressora entram automaticamente no custo — não precisa digitar nada.</small>
                </section>

                <section className="calc-section">
                  <Title text="MARGEM DE LUCRO" />
                  <label>Margem (%)<input inputMode="decimal" value={draft.profitMargin} onChange={(event) => setDraft({ ...draft, profitMargin: event.target.value })} /></label>
                </section>
              </div>

              <aside className="price-summary">
                <span className="summary-eyebrow">PREÇO SUGERIDO</span>
                <h2>{brl(suggestedPrice)}</h2>
                <hr />
                <div className="summary-title"><span>Composição de custo</span><strong>Total: {brl(cost.total)}</strong></div>
                <div className="summary-card">
                  <Cost label="Material" value={cost.filament} />
                  <Cost label="Mão de obra" value={cost.labor} />
                  <Cost label="Energia" value={cost.energy} />
                  <Cost label="Depreciação" value={cost.machine} />
                  <Cost label="Custos fixos rateados" value={cost.fixedCosts} />
                  <hr />
                  <Cost label="Custo Total" value={cost.total} bold />
                </div>
                <div className="form-actions">
                  <button className="primary-button" type="submit">{editingId ? "Atualizar produto" : "Salvar produto"}</button>
                  <button className="secondary-button" type="button" onClick={() => setView("list")}>Cancelar</button>
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
function Cost({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={bold ? "cost-line bold" : "cost-line"}>
      <span>{label}</span>
      <strong>{brl(value)}</strong>
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
