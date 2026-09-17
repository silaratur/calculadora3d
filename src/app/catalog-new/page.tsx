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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
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
    setFeedback(editingId ? "Produto atualizado." : "Produto cadastrado — SKU gerado automaticamente.");
    setDraft(emptyDraft);
    setEditingId(null);
    reload();
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
    document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function archive(id: string) {
    if (!window.confirm("Desativar este produto? O histórico será preservado.")) return;
    await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="catalogNew" badges={{ catalogNew: products.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e cadastrar produtos do catálogo." /> : null}
        <section className="library-heading">
          <div>
            <h1>Catálogo Novo <span className="brand-tag">EM TESTE</span></h1>
            <p>Versão em teste do catálogo — mescla a calculadora (multi-material, tempo, impressora) com o cadastro de produto. Vai substituir o Catálogo atual quando validada.</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU ou produto..." />
            <a className="new-quote-button" href="#product-form">＋ Novo produto</a>
          </div>
        </section>

        <div className="catalog-layout">
          <form id="product-form" className="preset-form" onSubmit={save}>
            <h2>{editingId ? "Editar produto" : "Novo produto"}</h2>
            <p className="sku-hint">
              {editingId
                ? <>SKU <strong>{products.find((item) => item.id === editingId)?.sku}</strong> — fixo, não muda ao editar.</>
                : "O SKU é gerado automaticamente a partir da categoria (ex: Decoração → D.001, Natal → N.001)."}
            </p>

            <label>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Porta Guardanapos" /></label>
            <label>Categoria<input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ex: Decoração, Natal..." /></label>
            <label>Descrição<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Aparece no card do catálogo" /></label>

            <label>Foto do produto<input type="file" accept="image/*" onChange={handleImage} /></label>
            {imageError ? <p className="admin-feedback">{imageError}</p> : null}
            {draft.imageUrl ? (
              <div className="image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                <img src={draft.imageUrl} alt="Prévia do produto" />
                <button type="button" className="secondary-button" onClick={() => setDraft({ ...draft, imageUrl: "" })}>Remover foto</button>
              </div>
            ) : null}

            <div className="settings-group">
              <h3>Material & Filamento</h3>
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
            </div>

            <div className="settings-group">
              <h3>Tempo de produção (peça inteira)</h3>
              <div className="form-grid">
                <label>Horas de impressão<input inputMode="numeric" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} /></label>
                <label>Minutos de impressão<input inputMode="numeric" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} /></label>
              </div>
              <div className="form-grid">
                <label>Fatiamento / Prep (min)<input inputMode="numeric" value={draft.prep} onChange={(event) => setDraft({ ...draft, prep: event.target.value })} /></label>
                <label>Limpeza / Pós-proc (min)<input inputMode="numeric" value={draft.cleanup} onChange={(event) => setDraft({ ...draft, cleanup: event.target.value })} /></label>
              </div>
              <p className="settings-intro">
                Um kit de vários itens impressos separadamente? Some o tempo total de todas as peças aqui — é o tempo de máquina que esse produto consome por unidade vendida.
              </p>
            </div>

            <div className="settings-group">
              <h3>Impressora</h3>
              <div className="field-row library-row">
                <label>Selecionar da Biblioteca<select value={draft.printerId} onChange={(event) => setDraft({ ...draft, printerId: event.target.value })}><option value="">Sem impressora (sem depreciação de máquina)</option>{printers.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></label>
                <a className="bookmark-link" href="/admin" title="Gerenciar presets na Biblioteca"><IconBookmark className="nav-icon" /></a>
              </div>
              <p className="settings-intro">Depreciação, manutenção e consumo de energia dessa impressora entram automaticamente no custo — não precisa digitar nada.</p>
            </div>

            <label>Margem (%)<input inputMode="decimal" value={draft.profitMargin} onChange={(event) => setDraft({ ...draft, profitMargin: event.target.value })} /></label>

            <div className="catalog-preview">
              <span>Custo de material</span><strong>{brl(cost.filament)}</strong>
              <span>Mão de obra</span><strong>{brl(cost.labor)}</strong>
              <span>Energia</span><strong>{brl(cost.energy)}</strong>
              <span>Depreciação da máquina</span><strong>{brl(cost.machine)}</strong>
              <span>Custos fixos rateados</span><strong>{brl(cost.fixedCosts)}</strong>
              <span>Custo total</span><strong>{brl(cost.total)}</strong>
              <span>Preço sugerido</span><strong>{brl(suggestedPrice)}</strong>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit">{editingId ? "Atualizar produto" : "Salvar produto"}</button>
              {editingId ? <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>Cancelar</button> : null}
            </div>
            {feedback ? <p className="admin-feedback">{feedback}</p> : null}
          </form>

          <section className="catalog-results">
            <div className="catalog-filters">
              <strong>{filtered.length} produtos</strong>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item} value={item}>{item === "all" ? "Todas as categorias" : item}</option>)}
              </select>
            </div>
            <div className="product-grid">
              {filtered.map((product) => (
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
            {filtered.length === 0 ? <div className="empty-note">Nenhum produto encontrado.</div> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
