"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { brl } from "@/lib/money";
import { BADGE_PRESETS, COLLECTION_TONES, periodStatus, type CollectionTone } from "@/lib/showcase";

/**
 * Loja → Vitrine: ordem e destaque das peças na loja, selos, banner da abertura
 * e coleções editáveis (que substituem as vitrines automáticas por data).
 */
type ShowcaseProduct = { id: string; sku: string; name: string; category: string; price: number; inStore: boolean; storeFeatured: boolean; storeBadge: string; storeOrder: number; createdAt: string; images: string[] };
type Collection = { id: string; title: string; lead: string; tone: CollectionTone; startsAt: string | null; endsAt: string | null; productIds: string[]; active: boolean; sortOrder: number };
type Banner = { id: string; title: string; subtitle: string; buttonLabel: string; target: string; productId: string | null; imageIndex: number; startsAt: string | null; endsAt: string | null; active: boolean };
type Row = { id: string; storeFeatured: boolean; storeBadge: string };

const STORE_URL = "https://ac3d.silaratur.cloud";
const toneLabel: Record<CollectionTone, string> = { vinho: "Vinho", rosa: "Rosa", oliva: "Oliva" };
const statusTag: Record<string, string> = { "no ar": "today-tag positive", agendado: "today-tag", encerrado: "today-tag muted", pausado: "today-tag muted" };
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const period = (start: string | null, end: string | null) => (start && end ? `${shortDate(start)} a ${shortDate(end)}` : start ? `a partir de ${shortDate(start)}` : end ? `até ${shortDate(end)}` : "sem prazo");
const asPeriod = (item: { startsAt: string | null; endsAt: string | null; active: boolean }) => ({ active: item.active, startsAt: item.startsAt ? new Date(item.startsAt) : null, endsAt: item.endsAt ? new Date(item.endsAt) : null });
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mesma ordem da loja: posição definida primeiro, depois as mais novas. */
function storeSort(a: ShowcaseProduct, b: ShowcaseProduct) {
  if (a.storeOrder && b.storeOrder) return a.storeOrder - b.storeOrder;
  if (a.storeOrder) return -1;
  if (b.storeOrder) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Último dia para pedir: N dias úteis antes da data. */
function deadline(end: string, days: number) {
  let date = new Date(end);
  let left = days;
  while (left > 0) {
    date = new Date(date.getTime() - 86400000);
    if (date.getDay() !== 0 && date.getDay() !== 6) left -= 1;
  }
  return date;
}

/** Sugestões de coleção (as datas que ainda vão chegar), com as palavras que acham as peças. */
function presets(now = new Date()) {
  const year = now.getFullYear();
  const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
  const november1 = at(year, 11, 1);
  const blackFriday = at(year, 11, 1 + ((5 - november1.getDay() + 7) % 7) + 21, 23);
  const list = [
    { key: "natal", title: "Natal", tone: "vinho" as CollectionTone, start: at(year, 10, 13), end: at(year, 12, 25, 23), lead: "Decoração natalina impressa sob encomenda. Peça com antecedência para receber antes do dia 25.", terms: ["natal", "natalin", "rena", "presepio", "quebra nozes", "arvore", "papai noel"] },
    { key: "black-friday", title: "Black Friday", tone: "vinho" as CollectionTone, start: new Date(blackFriday.getTime() - 3 * 86400000), end: new Date(blackFriday.getTime() + 3 * 86400000), lead: "Preços especiais por poucos dias. Escolha as peças e garanta as suas antes de acabar a semana.", terms: [] as string[] },
    { key: "amigo-secreto", title: "Amigo secreto e fim de ano", tone: "rosa" as CollectionTone, start: at(year, 11, 15), end: at(year, 12, 20, 23), lead: "Lembrancinhas e presentes pequenos para a troca de fim de ano.", terms: ["chaveiro", "mini", "porta", "vaso", "lembrancinha", "articulad"] },
    { key: "criancas", title: "Dia das Crianças", tone: "rosa" as CollectionTone, start: at(year, 9, 10), end: at(year, 10, 12, 23), lead: "Brinquedos articulados e sensoriais para presentear no dia 12.", terms: ["brinquedo", "articulado", "sensorial", "infantil", "mini", "capivara", "panda", "unicornio", "dinossauro"] },
    { key: "professores", title: "Dia dos Professores", tone: "oliva" as CollectionTone, start: at(year, 10, 1), end: at(year, 10, 15, 23), lead: "Lembrancinhas e brindes para agradecer no dia 15.", terms: ["leitura", "brinde", "lembrancinha", "marca pagina", "check list", "checklist"] },
  ];
  return list.filter((item) => item.end.getTime() > now.getTime());
}

const emptyCollection = { title: "", lead: "", tone: "vinho" as CollectionTone, startsAt: "", endsAt: "", productIds: [] as string[], active: true };
const emptyBanner = { title: "", subtitle: "", buttonLabel: "", targetKind: "produto" as "produto" | "colecao" | "link" | "nenhum", targetValue: "", productId: "", imageIndex: 0, startsAt: "", endsAt: "", active: true };

export default function ShowcasePage() {
  const [products, setProducts] = useState<ShowcaseProduct[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [productionDays, setProductionDays] = useState(7);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);
  const [collectionForm, setCollectionForm] = useState(emptyCollection);
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [editingBanner, setEditingBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/loja/vitrine", { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) { setNeedsLogin(true); return; }
      if (!response.ok) return;
      const data = (await response.json()) as { products: ShowcaseProduct[]; collections: Collection[]; banners: Banner[]; productionDays: number };
      setProducts(data.products);
      setCollections(data.collections);
      setBanners(data.banners);
      setProductionDays(data.productionDays);
      setRows(data.products.filter((product) => product.inStore).sort(storeSort).map((product) => ({ id: product.id, storeFeatured: product.storeFeatured, storeBadge: product.storeBadge })));
      setDirty(false);
    });
    return () => { cancelled = true; };
  }, [reload]);

  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const storeProducts = useMemo(() => products.filter((product) => product.inStore), [products]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setDirty(true);
  }
  function move(id: string, to: number) {
    setRows((current) => {
      const from = current.findIndex((row) => row.id === id);
      if (from < 0 || to < 0 || to >= current.length || from === to) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  }

  async function saveShowcase() {
    setFeedback("");
    const response = await fetch("/api/loja/vitrine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: rows.map((row, index) => ({ id: row.id, storeOrder: index + 1, storeFeatured: row.storeFeatured, storeBadge: row.storeBadge.trim() })) }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível salvar a vitrine."); return; }
    setFeedback("Vitrine salva. A loja já mostra a nova ordem, destaques e selos.");
    setReload((value) => value + 1);
  }

  // ---------- Coleções
  const collectionPicker = storeProducts.filter((product) => !pickerSearch.trim() || normalize(`${product.sku} ${product.name} ${product.category}`).includes(normalize(pickerSearch.trim())));
  function applyPreset(preset: ReturnType<typeof presets>[number]) {
    const terms = preset.terms.map(normalize);
    const suggested = terms.length ? storeProducts.filter((product) => terms.some((term) => normalize(`${product.name} ${product.category}`).includes(term))).slice(0, 12).map((product) => product.id) : [];
    setEditingCollection(null);
    setCollectionForm({ title: preset.title, lead: preset.lead, tone: preset.tone, startsAt: toLocalInput(preset.start.toISOString()), endsAt: toLocalInput(preset.end.toISOString()), productIds: suggested, active: true });
    setFeedback(terms.length ? `Sugestão de ${preset.title}: ${suggested.length} peça(s) encontradas pelas palavras da data. Ajuste e salve.` : `Sugestão de ${preset.title}: escolha as peças (dica: as que estão em promoção).`);
  }
  function toggleCollectionProduct(id: string) {
    setCollectionForm((current) => ({ ...current, productIds: current.productIds.includes(id) ? current.productIds.filter((item) => item !== id) : [...current.productIds, id] }));
  }
  async function saveCollection(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload = { title: collectionForm.title.trim(), lead: collectionForm.lead.trim(), tone: collectionForm.tone, startsAt: fromLocalInput(collectionForm.startsAt), endsAt: fromLocalInput(collectionForm.endsAt), productIds: collectionForm.productIds, active: collectionForm.active, sortOrder: 0 };
    const response = await fetch(editingCollection ? `/api/loja/colecoes?id=${encodeURIComponent(editingCollection)}` : "/api/loja/colecoes", { method: editingCollection ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível salvar a coleção."); return; }
    setFeedback(editingCollection ? "Coleção atualizada." : `Coleção ${payload.title} criada.`);
    setCollectionForm(emptyCollection);
    setEditingCollection(null);
    setReload((value) => value + 1);
  }
  function editCollection(collection: Collection) {
    setEditingCollection(collection.id);
    setCollectionForm({ title: collection.title, lead: collection.lead, tone: collection.tone, startsAt: toLocalInput(collection.startsAt), endsAt: toLocalInput(collection.endsAt), productIds: collection.productIds, active: collection.active });
    document.getElementById("collection-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function toggleCollection(collection: Collection) {
    await fetch(`/api/loja/colecoes?id=${encodeURIComponent(collection.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...collection, active: !collection.active }) });
    setReload((value) => value + 1);
  }
  async function deleteCollection(collection: Collection) {
    if (!window.confirm(`Excluir a coleção ${collection.title}?`)) return;
    await fetch(`/api/loja/colecoes?id=${encodeURIComponent(collection.id)}`, { method: "DELETE" });
    setReload((value) => value + 1);
  }
  const liveCollections = collections.filter((collection) => periodStatus(asPeriod(collection)) === "no ar");

  // ---------- Banner
  const bannerProduct = bannerForm.productId ? byId.get(bannerForm.productId) : undefined;
  const bannerImage = bannerProduct?.images[bannerForm.imageIndex] ?? bannerProduct?.images[0] ?? null;
  const bannerTarget = () => {
    if (bannerForm.targetKind === "produto") return bannerForm.targetValue ? `produto:${bannerForm.targetValue}` : "";
    if (bannerForm.targetKind === "colecao") return bannerForm.targetValue ? `colecao:${bannerForm.targetValue}` : "";
    if (bannerForm.targetKind === "link") return bannerForm.targetValue.trim();
    return "";
  };
  async function saveBanner(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload = { title: bannerForm.title.trim(), subtitle: bannerForm.subtitle.trim(), buttonLabel: bannerForm.buttonLabel.trim(), target: bannerTarget(), productId: bannerForm.productId || null, imageIndex: bannerForm.imageIndex, startsAt: fromLocalInput(bannerForm.startsAt), endsAt: fromLocalInput(bannerForm.endsAt), active: bannerForm.active };
    const response = await fetch(editingBanner ? `/api/loja/banners?id=${encodeURIComponent(editingBanner)}` : "/api/loja/banners", { method: editingBanner ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível salvar o banner."); return; }
    setFeedback(editingBanner ? "Banner atualizado." : "Banner criado.");
    setBannerForm(emptyBanner);
    setEditingBanner(null);
    setReload((value) => value + 1);
  }
  function editBanner(banner: Banner) {
    setEditingBanner(banner.id);
    const [kind, value] = banner.target.startsWith("produto:") ? ["produto", banner.target.slice(8)] : banner.target.startsWith("colecao:") ? ["colecao", banner.target.slice(8)] : banner.target ? ["link", banner.target] : ["nenhum", ""];
    setBannerForm({ title: banner.title, subtitle: banner.subtitle, buttonLabel: banner.buttonLabel, targetKind: kind as typeof emptyBanner.targetKind, targetValue: value, productId: banner.productId ?? "", imageIndex: banner.imageIndex, startsAt: toLocalInput(banner.startsAt), endsAt: toLocalInput(banner.endsAt), active: banner.active });
    document.getElementById("banner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function toggleBanner(banner: Banner) {
    await fetch(`/api/loja/banners?id=${encodeURIComponent(banner.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...banner, active: !banner.active }) });
    setReload((value) => value + 1);
  }
  async function deleteBanner(banner: Banner) {
    if (!window.confirm(`Excluir o banner "${banner.title}"?`)) return;
    await fetch(`/api/loja/banners?id=${encodeURIComponent(banner.id)}`, { method: "DELETE" });
    setReload((value) => value + 1);
  }
  const liveBanner = banners.find((banner) => periodStatus(asPeriod(banner)) === "no ar");
  const targetLabel = (target: string) => (target.startsWith("produto:") ? `abre ${products.find((product) => product.sku === target.slice(8))?.name ?? target.slice(8)}` : target.startsWith("colecao:") ? `rola até ${collections.find((collection) => collection.id === target.slice(8))?.title ?? "a coleção"}` : target ? "abre um link" : "sem botão");
  const featuredCount = rows.filter((row) => row.storeFeatured).length;

  return (
    <main className="admin-shell">
      <AdminHeader active="loja-vitrine" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para editar a vitrine." /> : null}
        <section className="library-heading">
          <div>
            <h1>Vitrine</h1>
            <p>O que aparece primeiro na <a href={STORE_URL} target="_blank" rel="noreferrer">loja</a>: banner da abertura, coleções, destaques, selos e a ordem das peças.</p>
          </div>
        </section>
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <h2 className="today-section-title">Banner da abertura</h2>
        <div className="promo-layout">
          <section className="preset-form">
            <p className="settings-intro">{liveBanner ? `No ar: "${liveBanner.title}".` : "Nenhum banner no ar: a loja mostra a abertura padrão (\"Pequenas peças, feitas camada por camada\")."}</p>
            {banners.length ? (
              <div className="promo-table-wrap">
                <table className="promo-table">
                  <thead><tr><th>Banner</th><th>Botão</th><th>Período</th><th>Situação</th><th aria-label="Ações" /></tr></thead>
                  <tbody>
                    {banners.map((banner) => {
                      const status = periodStatus(asPeriod(banner));
                      return (
                        <tr key={banner.id}>
                          <td><b>{banner.title}</b>{banner.subtitle ? <small>{banner.subtitle}</small> : null}</td>
                          <td>{banner.buttonLabel || "—"}<small>{targetLabel(banner.target)}</small></td>
                          <td>{period(banner.startsAt, banner.endsAt)}</td>
                          <td><em className={statusTag[status]}>{status}</em></td>
                          <td className="promo-actions">
                            <button type="button" className="link-button" onClick={() => editBanner(banner)}>Editar</button>
                            <button type="button" className="link-button" onClick={() => void toggleBanner(banner)}>{banner.active ? "Pausar" : "Ativar"}</button>
                            <button type="button" className="link-button" onClick={() => void deleteBanner(banner)}>Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="banner-preview" aria-label="Prévia do banner">
              <div className="banner-preview-copy">
                <strong>{bannerForm.title || "Título do banner"}</strong>
                <span>{bannerForm.subtitle || "Texto curto que aparece embaixo do título."}</span>
                {bannerForm.buttonLabel ? <em>{bannerForm.buttonLabel}</em> : null}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Catálogo */}
              {bannerImage ? <img src={bannerImage} alt="" /> : <span className="banner-preview-empty">Escolha a foto</span>}
            </div>
          </section>

          <form id="banner-form" className="preset-form promo-form" onSubmit={saveBanner}>
            <h2>{editingBanner ? "Editar banner" : "Novo banner"}</h2>
            <label>Título<input value={bannerForm.title} maxLength={70} onChange={(event) => setBannerForm({ ...bannerForm, title: event.target.value })} placeholder="O Natal chegou ao estúdio" required /></label>
            <label>Texto (opcional)<input value={bannerForm.subtitle} maxLength={200} onChange={(event) => setBannerForm({ ...bannerForm, subtitle: event.target.value })} placeholder="Árvores, renas e presépios impressos sob encomenda." /></label>
            <div className="form-grid">
              <label>Texto do botão<input value={bannerForm.buttonLabel} maxLength={30} onChange={(event) => setBannerForm({ ...bannerForm, buttonLabel: event.target.value })} placeholder="Ver a coleção" /></label>
              <label>O botão leva para
                <select value={bannerForm.targetKind} onChange={(event) => setBannerForm({ ...bannerForm, targetKind: event.target.value as typeof emptyBanner.targetKind, targetValue: "" })}>
                  <option value="produto">Uma peça</option>
                  <option value="colecao">Uma coleção</option>
                  <option value="link">Um link</option>
                  <option value="nenhum">Sem botão</option>
                </select>
              </label>
            </div>
            {bannerForm.targetKind === "produto" ? (
              <label>Peça<select value={bannerForm.targetValue} onChange={(event) => setBannerForm({ ...bannerForm, targetValue: event.target.value, productId: bannerForm.productId || (storeProducts.find((product) => product.sku === event.target.value)?.id ?? "") })}>
                <option value="">Escolha…</option>
                {storeProducts.map((product) => <option key={product.id} value={product.sku}>{product.sku} — {product.name}</option>)}
              </select></label>
            ) : bannerForm.targetKind === "colecao" ? (
              <label>Coleção<select value={bannerForm.targetValue} onChange={(event) => setBannerForm({ ...bannerForm, targetValue: event.target.value })}>
                <option value="">Escolha…</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
              </select></label>
            ) : bannerForm.targetKind === "link" ? (
              <label>Link (https://…)<input type="url" value={bannerForm.targetValue} onChange={(event) => setBannerForm({ ...bannerForm, targetValue: event.target.value })} placeholder="https://instagram.com/ac3d_studio" /></label>
            ) : null}
            <label>Foto (de uma peça da loja)<select value={bannerForm.productId} onChange={(event) => setBannerForm({ ...bannerForm, productId: event.target.value, imageIndex: 0 })}>
              <option value="">Escolha…</option>
              {storeProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
            </select></label>
            {bannerProduct && bannerProduct.images.length > 1 ? (
              <div className="banner-thumbs" role="group" aria-label="Escolha a foto">
                {bannerProduct.images.map((src, index) => (
                  <button key={src} type="button" aria-pressed={bannerForm.imageIndex === index} onClick={() => setBannerForm({ ...bannerForm, imageIndex: index })}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Catálogo */}
                    <img src={src} alt={`Foto ${index + 1}`} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="form-grid">
              <label>Começa em (opcional)<input type="datetime-local" value={bannerForm.startsAt} onChange={(event) => setBannerForm({ ...bannerForm, startsAt: event.target.value })} /></label>
              <label>Termina em (opcional)<input type="datetime-local" value={bannerForm.endsAt} onChange={(event) => setBannerForm({ ...bannerForm, endsAt: event.target.value })} /></label>
            </div>
            <label className="checkbox-field"><input type="checkbox" checked={bannerForm.active} onChange={(event) => setBannerForm({ ...bannerForm, active: event.target.checked })} /> Ativo</label>
            <div className="form-actions">
              <button className="primary-button" type="submit">{editingBanner ? "Salvar banner" : "Criar banner"}</button>
              {editingBanner ? <button className="secondary-button" type="button" onClick={() => { setEditingBanner(null); setBannerForm(emptyBanner); }}>Cancelar</button> : null}
            </div>
          </form>
        </div>

        <h2 className="today-section-title">Coleções</h2>
        <div className="promo-layout">
          <section className="preset-form">
            <p className="settings-intro">
              {liveCollections.length
                ? `No ar: ${liveCollections.map((collection) => collection.title).join(", ")}. Enquanto houver coleção no ar, a loja mostra só as suas coleções.`
                : "Nenhuma coleção no ar: a loja monta sozinha as vitrines das datas (Dia das Crianças, Natal…) pelas palavras do nome das peças."}
            </p>
            {collections.length ? (
              <div className="promo-table-wrap">
                <table className="promo-table">
                  <thead><tr><th>Coleção</th><th>Peças</th><th>Período</th><th>Peça até</th><th>Situação</th><th aria-label="Ações" /></tr></thead>
                  <tbody>
                    {collections.map((collection) => {
                      const status = periodStatus(asPeriod(collection));
                      return (
                        <tr key={collection.id}>
                          <td><b>{collection.title}</b><small>{toneLabel[collection.tone]}{collection.lead ? ` · ${collection.lead}` : ""}</small></td>
                          <td className="num">{collection.productIds.filter((id) => byId.get(id)?.inStore).length}</td>
                          <td>{period(collection.startsAt, collection.endsAt)}</td>
                          <td className="num">{collection.endsAt ? shortDate(deadline(collection.endsAt, productionDays).toISOString()) : "—"}</td>
                          <td><em className={statusTag[status]}>{status}</em></td>
                          <td className="promo-actions">
                            <button type="button" className="link-button" onClick={() => editCollection(collection)}>Editar</button>
                            <button type="button" className="link-button" onClick={() => void toggleCollection(collection)}>{collection.active ? "Pausar" : "Ativar"}</button>
                            <button type="button" className="link-button" onClick={() => void deleteCollection(collection)}>Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="collection-presets">
              <span>Começar de uma sugestão:</span>
              {presets().map((preset) => <button key={preset.key} type="button" className="chip" onClick={() => applyPreset(preset)}>{preset.title}</button>)}
            </div>
          </section>

          <form id="collection-form" className="preset-form promo-form" onSubmit={saveCollection}>
            <h2>{editingCollection ? "Editar coleção" : "Nova coleção"}</h2>
            <label>Nome<input value={collectionForm.title} maxLength={60} onChange={(event) => setCollectionForm({ ...collectionForm, title: event.target.value })} placeholder="Natal" required /></label>
            <label>Frase (opcional)<input value={collectionForm.lead} maxLength={200} onChange={(event) => setCollectionForm({ ...collectionForm, lead: event.target.value })} placeholder="Decoração natalina impressa sob encomenda." /></label>
            <fieldset className="tone-picker">
              <legend>Cor da faixa</legend>
              {COLLECTION_TONES.map((tone) => (
                <label key={tone} className={collectionForm.tone === tone ? `chip selected tone-${tone}` : `chip tone-${tone}`}>
                  <input type="radio" name="tone" checked={collectionForm.tone === tone} onChange={() => setCollectionForm({ ...collectionForm, tone })} /> {toneLabel[tone]}
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <label>Aparece a partir de<input type="datetime-local" value={collectionForm.startsAt} onChange={(event) => setCollectionForm({ ...collectionForm, startsAt: event.target.value })} /></label>
              <label>Data comemorativa (fim)<input type="datetime-local" value={collectionForm.endsAt} onChange={(event) => setCollectionForm({ ...collectionForm, endsAt: event.target.value })} /></label>
            </div>
            {collectionForm.endsAt ? <p className="field-hint">A loja avisa: &quot;Peça até {shortDate(deadline(new Date(collectionForm.endsAt).toISOString(), productionDays).toISOString())} para ficar pronto a tempo&quot; ({productionDays} dias úteis de produção).</p> : null}
            <div className="collection-picker">
              <div className="collection-picker-head">
                <strong>Peças ({collectionForm.productIds.length})</strong>
                <input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Buscar peça..." aria-label="Buscar peça para a coleção" />
              </div>
              <ul>
                {collectionPicker.map((product) => (
                  <li key={product.id}>
                    <label className={collectionForm.productIds.includes(product.id) ? "selected" : undefined}>
                      <input type="checkbox" checked={collectionForm.productIds.includes(product.id)} onChange={() => toggleCollectionProduct(product.id)} />
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Catálogo */}
                      {product.images[0] ? <img src={product.images[0]} alt="" /> : <span className="thumb-empty" />}
                      <span>{product.name}<small>{product.sku} · {brl(product.price)}</small></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <label className="checkbox-field"><input type="checkbox" checked={collectionForm.active} onChange={(event) => setCollectionForm({ ...collectionForm, active: event.target.checked })} /> Ativa</label>
            <div className="form-actions">
              <button className="primary-button" type="submit">{editingCollection ? "Salvar coleção" : "Criar coleção"}</button>
              {editingCollection ? <button className="secondary-button" type="button" onClick={() => { setEditingCollection(null); setCollectionForm(emptyCollection); }}>Cancelar</button> : null}
            </div>
          </form>
        </div>

        <h2 className="today-section-title">Ordem, destaques e selos</h2>
        <section className="preset-form showcase-order">
          <div className="showcase-order-head">
            <p className="settings-intro">Arraste (ou use as setas) para escolher a ordem das peças nas prateleiras da loja. <b>Destaque</b> coloca a peça na faixa &quot;Em destaque&quot;, logo depois da abertura ({featuredCount} marcada{featuredCount === 1 ? "" : "s"}). O <b>selo</b> aparece escrito no card.</p>
            <button type="button" className="primary-button" disabled={!dirty} onClick={() => void saveShowcase()}>{dirty ? "Salvar vitrine" : "Vitrine salva"}</button>
          </div>
          <datalist id="badge-presets">{BADGE_PRESETS.map((badge) => <option key={badge} value={badge} />)}</datalist>
          <ol className="showcase-list">
            {rows.map((row, index) => {
              const product = byId.get(row.id);
              if (!product) return null;
              return (
                <li
                  key={row.id}
                  draggable
                  className={dragging === row.id ? "dragging" : undefined}
                  onDragStart={() => setDragging(row.id)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => { event.preventDefault(); if (dragging && dragging !== row.id) move(dragging, index); }}
                >
                  <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                  <span className="showcase-position num">{index + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Catálogo */}
                  {product.images[0] ? <img src={product.images[0]} alt="" /> : <span className="thumb-empty" />}
                  <span className="showcase-name">{product.name}<small>{product.sku} · {product.category} · {brl(product.price)}</small></span>
                  <button type="button" className={row.storeFeatured ? "feature-toggle on" : "feature-toggle"} aria-pressed={row.storeFeatured} onClick={() => updateRow(row.id, { storeFeatured: !row.storeFeatured })}>
                    {row.storeFeatured ? "★ Em destaque" : "☆ Destacar"}
                  </button>
                  <input className="badge-input" list="badge-presets" value={row.storeBadge} maxLength={24} onChange={(event) => updateRow(row.id, { storeBadge: event.target.value })} placeholder="Selo (opcional)" aria-label={`Selo de ${product.name}`} />
                  <span className="showcase-arrows">
                    <button type="button" onClick={() => move(row.id, index - 1)} disabled={index === 0} aria-label={`Subir ${product.name}`}>↑</button>
                    <button type="button" onClick={() => move(row.id, index + 1)} disabled={index === rows.length - 1} aria-label={`Descer ${product.name}`}>↓</button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
