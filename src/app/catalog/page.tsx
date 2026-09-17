"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { calculateMultiMaterialCost, calculateSuggestedPrice } from "@/lib/costing";

type Material = { id: string; name: string; type: string; unitPrice: number; unitWeightGrams: number; costPerKg: number };
type MaterialLine = { materialId: string; grams: number };
type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  description?: string;
  imageUrl: string;
  material: string;
  weightGrams: number;
  printTimeHours: number;
  laborCost: number;
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
  weightGrams: number;
  printTimeHours: number;
  materialLines: MaterialLine[];
  laborCost: number;
  overheadCost: number;
  profitMargin: number;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  category: "Decoração",
  description: "",
  imageUrl: "",
  weightGrams: 0,
  printTimeHours: 0,
  materialLines: [],
  laborCost: 0,
  overheadCost: 0,
  profitMargin: 40,
  active: true,
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;

/** Reduz a foto no navegador antes de guardar (data URI) — evita que uma foto de câmera de vários MB vá pro banco. */
function resizeImage(file: File, maxWidth = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas indisponível neste navegador.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
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
      const [productRes, materialRes] = await Promise.all([fetch("/api/products"), fetch("/api/materials")]);
      if (productRes.status === 401 || materialRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (productRes.ok) setProducts((await productRes.json()) as Product[]);
      if (materialRes.ok) setMaterials((await materialRes.json()) as Material[]);
    }
    void load();
  }, [reloadToken]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((product) => product.category)))], [products]);
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          `${product.sku} ${product.name} ${product.material}`.toLowerCase().includes(search.toLowerCase()) &&
          (category === "all" || product.category === category),
      ),
    [category, products, search],
  );

  const materialLinesWithData = draft.materialLines
    .map((line) => ({ line, material: materials.find((item) => item.id === line.materialId) }))
    .filter((entry): entry is { line: MaterialLine; material: Material } => Boolean(entry.material));
  const materialCost = calculateMultiMaterialCost(materialLinesWithData.map((entry) => ({ grams: entry.line.grams, material: entry.material })));
  const calculated = materialCost + draft.laborCost + draft.overheadCost;
  const suggestedPrice = calculateSuggestedPrice({ unitCost: calculated, markupPercent: draft.profitMargin }).suggested;

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
      weightGrams: draft.weightGrams,
      printTimeHours: draft.printTimeHours,
      materials: draft.materialLines.filter((line) => line.grams > 0),
      laborCost: draft.laborCost,
      overheadCost: draft.overheadCost,
      profitMargin: draft.profitMargin,
      active: draft.active,
      cost: calculated,
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
      weightGrams: product.weightGrams,
      printTimeHours: product.printTimeHours,
      materialLines: product.materials?.map((line) => ({ materialId: line.materialId, grams: line.grams })) ?? [],
      laborCost: product.laborCost,
      overheadCost: product.overheadCost,
      profitMargin: product.profitMargin,
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
      <AdminHeader active="catalog" badges={{ catalog: products.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e cadastrar produtos do catálogo." /> : null}
        <section className="library-heading">
          <div>
            <h1>Catálogo de Produtos</h1>
            <p>Cadastre produtos, custos, margens e preços sugeridos para reutilizar nos orçamentos.</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU, produto ou material..." />
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

            <label>Categoria<input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ex: Decoração, Natal..." /></label>
            <label>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Porta Guardanapos" /></label>
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

            <div className="material-lines">
              <span className="material-lines-label">Material(is) usado(s) — da Biblioteca</span>
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

            <div className="form-grid">
              <label>Peso usado (g)<input inputMode="decimal" value={draft.weightGrams} onChange={(event) => setDraft({ ...draft, weightGrams: n(event.target.value) })} /></label>
              <label>Tempo de impressão (h)<input inputMode="decimal" value={draft.printTimeHours} onChange={(event) => setDraft({ ...draft, printTimeHours: n(event.target.value) })} /></label>
            </div>
            <div className="form-grid">
              <label>Mão de obra (R$)<input inputMode="decimal" value={draft.laborCost} onChange={(event) => setDraft({ ...draft, laborCost: n(event.target.value) })} /></label>
              <label>Overhead (R$)<input inputMode="decimal" value={draft.overheadCost} onChange={(event) => setDraft({ ...draft, overheadCost: n(event.target.value) })} /></label>
            </div>
            <label>Margem (%)<input inputMode="decimal" value={draft.profitMargin} onChange={(event) => setDraft({ ...draft, profitMargin: n(event.target.value) })} /></label>

            <div className="catalog-preview">
              <span>Custo de material (calculado)</span><strong>{brl(materialCost)}</strong>
              <span>Custo total</span><strong>{brl(calculated)}</strong>
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
                  <p>{product.category} · {product.material || "Sem material definido"} · {product.weightGrams}g</p>
                  <div className="product-card-prices">
                    <div><span>Custo</span><strong>{brl(product.cost)}</strong></div>
                    <div><span>Preço</span><strong>{brl(product.price)}</strong></div>
                  </div>
                  <p className="card-detail">Margem: {product.profitMargin}% · Impressão: {product.printTimeHours}h</p>
                  <a className="load-editor-button" href={`/calculator?productId=${product.id}`}>Abrir na calculadora</a>
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
