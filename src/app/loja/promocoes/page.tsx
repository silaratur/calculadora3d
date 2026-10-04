"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { TARGET_MARGIN } from "@/lib/competitors";
import { brl } from "@/lib/money";
import { applyPercent, couponLabel, couponStatus, marginAt, promoStatus } from "@/lib/promotions";

/**
 * Loja → Promoções: preço "de/por" por produto (% com período, aplicado também
 * a cada tamanho) e cupons. Toda promoção mostra a margem que sobra e avisa
 * quando cai abaixo da meta mínima (30%) ou do custo.
 */
type PromoProduct = {
  id: string; sku: string; name: string; category: string; price: number; cost: number; showInStore: boolean; brandReview: string;
  sizes: { name: string; price: number }[];
  promoPercent: number; promoLabel: string; promoStartsAt: string | null; promoEndsAt: string | null;
};
type Coupon = { id: string; code: string; kind: "PERCENT" | "FIXED"; value: number; minOrder: number; startsAt: string | null; endsAt: string | null; maxUses: number | null; uses: number; active: boolean; notes: string };

const emptyPromo = { percent: "", label: "", startsAt: "", endsAt: "" };
const emptyCoupon = { code: "", kind: "PERCENT" as "PERCENT" | "FIXED", value: "", minOrder: "", startsAt: "", endsAt: "", maxUses: "", active: true, notes: "" };
const num = (value: string) => { const clean = value.replace(/R\$\s?/g, "").replace(/\s/g, ""); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean) || 0; };
/** Date → valor de <input type="datetime-local"> no fuso do navegador. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const shortDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const period = (start: string | null, end: string | null) => (start && end ? `${shortDate(start)} a ${shortDate(end)}` : start ? `a partir de ${shortDate(start)}` : end ? `até ${shortDate(end)}` : "sem prazo");
const pct = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const statusTag: Record<string, string> = { ativa: "today-tag positive", agendada: "today-tag", encerrada: "today-tag muted", ativo: "today-tag positive", agendado: "today-tag", expirado: "today-tag muted", esgotado: "today-tag muted", pausado: "today-tag muted" };

export default function PromotionsPage() {
  const [products, setProducts] = useState<PromoProduct[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyStore, setOnlyStore] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promo, setPromo] = useState(emptyPromo);
  const [couponForm, setCouponForm] = useState(emptyCoupon);
  const [editingCoupon, setEditingCoupon] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/loja/promocoes", { cache: "no-store" }), fetch("/api/loja/cupons", { cache: "no-store" })]).then(async ([productsRes, couponsRes]) => {
      if (cancelled) return;
      if (productsRes.status === 401) { setNeedsLogin(true); return; }
      if (productsRes.ok) setProducts((await productsRes.json()) as PromoProduct[]);
      if (couponsRes.ok) setCoupons((await couponsRes.json()) as Coupon[]);
    });
    return () => { cancelled = true; };
  }, [reload]);

  const asDates = (product: PromoProduct) => ({ ...product, promoStartsAt: product.promoStartsAt ? new Date(product.promoStartsAt) : null, promoEndsAt: product.promoEndsAt ? new Date(product.promoEndsAt) : null });
  const statusOf = (product: PromoProduct) => promoStatus(asDates(product));
  const inStore = (product: PromoProduct) => product.showInStore && product.brandReview === "DONE";

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () => products.filter((product) => (!onlyStore || inStore(product)) && (!query || `${product.sku} ${product.name} ${product.category}`.toLowerCase().includes(query))),
    [products, onlyStore, query],
  );
  const withPromo = products.filter((product) => statusOf(product) !== "sem");
  const percent = num(promo.percent);
  const chosen = products.filter((product) => selected.has(product.id));
  // Margem de cada escolhido com o % digitado (base = preço do cadastro).
  const preview = chosen.map((product) => {
    const promoPrice = applyPercent(product.price, percent);
    return { product, promoPrice, margin: marginAt(promoPrice, product.cost) };
  });
  const belowCost = preview.filter((row) => row.promoPrice < row.product.cost);
  const belowTarget = preview.filter((row) => row.promoPrice >= row.product.cost && row.margin < TARGET_MARGIN);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const allVisibleSelected = visible.length > 0 && visible.every((product) => selected.has(product.id));
  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const product of visible) if (allVisibleSelected) next.delete(product.id); else next.add(product.id);
      return next;
    });
  }

  async function applyPromo(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!chosen.length) { setFeedback("Escolha pelo menos um produto na lista."); return; }
    if (!(percent >= 1 && percent <= 90)) { setFeedback("O desconto vai de 1% a 90%."); return; }
    if (belowCost.length && !window.confirm(`${belowCost.length} produto(s) ficariam ABAIXO DO CUSTO com ${percent}% de desconto. Aplicar mesmo assim?`)) return;
    const response = await fetch("/api/loja/promocoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: chosen.map((product) => product.id), percent, label: promo.label.trim(), startsAt: fromLocalInput(promo.startsAt), endsAt: fromLocalInput(promo.endsAt) }),
    });
    const body = (await response.json().catch(() => null)) as { updated?: number; error?: unknown } | null;
    if (!response.ok) { setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível aplicar. Confira o % e as datas."); return; }
    setFeedback(`Promoção aplicada a ${body?.updated ?? chosen.length} produto(s).`);
    setSelected(new Set());
    setPromo(emptyPromo);
    setReload((value) => value + 1);
  }

  async function endPromo(product: PromoProduct) {
    if (!window.confirm(`Encerrar a promoção de ${product.name}? Volta ao preço normal na loja.`)) return;
    await fetch(`/api/loja/promocoes?productId=${encodeURIComponent(product.id)}`, { method: "DELETE" });
    setReload((value) => value + 1);
  }

  function editPromo(product: PromoProduct) {
    setSelected(new Set([product.id]));
    setPromo({ percent: String(product.promoPercent).replace(".", ","), label: product.promoLabel, startsAt: toLocalInput(product.promoStartsAt), endsAt: toLocalInput(product.promoEndsAt) });
    document.getElementById("promo-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Cupom em %: quantos produtos da vitrine ficam abaixo da margem meta com ele (sem somar promoção).
  const couponValue = num(couponForm.value);
  const couponRisk = couponForm.kind === "PERCENT" && couponValue > 0
    ? products.filter((product) => inStore(product) && marginAt(applyPercent(product.price, couponValue), product.cost) < TARGET_MARGIN).length
    : 0;

  async function saveCoupon(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload = {
      code: couponForm.code.trim().toUpperCase(),
      kind: couponForm.kind,
      value: couponValue,
      minOrder: num(couponForm.minOrder),
      startsAt: fromLocalInput(couponForm.startsAt),
      endsAt: fromLocalInput(couponForm.endsAt),
      maxUses: couponForm.maxUses.trim() ? Math.round(num(couponForm.maxUses)) : null,
      active: couponForm.active,
      notes: couponForm.notes.trim(),
    };
    const response = await fetch(editingCoupon ? `/api/loja/cupons?id=${encodeURIComponent(editingCoupon)}` : "/api/loja/cupons", { method: editingCoupon ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível salvar o cupom."); return; }
    setFeedback(editingCoupon ? "Cupom atualizado." : `Cupom ${payload.code} criado.`);
    setCouponForm(emptyCoupon);
    setEditingCoupon(null);
    setReload((value) => value + 1);
  }

  function editCoupon(coupon: Coupon) {
    setEditingCoupon(coupon.id);
    setCouponForm({
      code: coupon.code, kind: coupon.kind, value: String(coupon.value).replace(".", ","), minOrder: coupon.minOrder ? String(coupon.minOrder).replace(".", ",") : "",
      startsAt: toLocalInput(coupon.startsAt), endsAt: toLocalInput(coupon.endsAt), maxUses: coupon.maxUses ? String(coupon.maxUses) : "", active: coupon.active, notes: coupon.notes,
    });
    document.getElementById("coupon-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleCoupon(coupon: Coupon) {
    await fetch(`/api/loja/cupons?id=${encodeURIComponent(coupon.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...coupon, active: !coupon.active }),
    });
    setReload((value) => value + 1);
  }

  async function deleteCoupon(coupon: Coupon) {
    if (!window.confirm(`Excluir o cupom ${coupon.code}? Quem tentar usar vai ver "cupom não encontrado".`)) return;
    await fetch(`/api/loja/cupons?id=${encodeURIComponent(coupon.id)}`, { method: "DELETE" });
    setReload((value) => value + 1);
  }

  const couponDates = (coupon: Coupon) => ({ ...coupon, startsAt: coupon.startsAt ? new Date(coupon.startsAt) : null, endsAt: coupon.endsAt ? new Date(coupon.endsAt) : null });

  return (
    <main className="admin-shell">
      <AdminHeader active="loja-promocoes" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver as promoções." /> : null}
        <section className="library-heading">
          <div>
            <h1>Promoções</h1>
            <p>Preço &quot;de/por&quot; com período e cupons da loja. A margem mínima da meta é {TARGET_MARGIN}%.</p>
          </div>
        </section>
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <h2 className="today-section-title">Produtos em promoção <span className="promo-count">{withPromo.length}</span></h2>
        {withPromo.length ? (
          <div className="promo-table-wrap">
            <table className="promo-table">
              <thead><tr><th>Produto</th><th>Promoção</th><th>De → por</th><th>Margem</th><th>Período</th><th>Situação</th><th aria-label="Ações" /></tr></thead>
              <tbody>
                {withPromo.map((product) => {
                  const status = statusOf(product);
                  const promoPrice = applyPercent(product.price, product.promoPercent);
                  const margin = marginAt(promoPrice, product.cost);
                  return (
                    <tr key={product.id}>
                      <td><b>{product.name}</b><small>{product.sku}{product.sizes.length ? ` · ${product.sizes.length} tamanhos (mesmo %)` : ""}</small></td>
                      <td>{product.promoLabel || "Promoção"} <b>-{String(product.promoPercent).replace(".", ",")}%</b></td>
                      <td className="num"><s>{brl(product.price)}</s> → <b>{brl(promoPrice)}</b></td>
                      <td className={margin < 0 ? "num negative" : margin < TARGET_MARGIN ? "num warn" : "num"}>{pct(margin)}</td>
                      <td>{period(product.promoStartsAt, product.promoEndsAt)}</td>
                      <td><em className={statusTag[status]}>{status}</em></td>
                      <td className="promo-actions">
                        <button type="button" className="link-button" onClick={() => editPromo(product)}>Editar</button>
                        <button type="button" className="link-button" onClick={() => void endPromo(product)}>Encerrar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="today-empty">Nenhum produto em promoção. Escolha os produtos abaixo e defina o desconto.</p>}

        <div className="promo-layout">
          <section className="preset-form promo-picker">
            <div className="promo-picker-head">
              <h2>Escolha os produtos</h2>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU, nome ou categoria..." aria-label="Buscar produto" />
              <label className="checkbox-field"><input type="checkbox" checked={onlyStore} onChange={(event) => setOnlyStore(event.target.checked)} /> Só os que estão na vitrine</label>
            </div>
            <div className="promo-table-wrap">
              <table className="promo-table selectable">
                <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Selecionar todos os visíveis" /></th><th>Produto</th><th>Preço</th><th>Custo</th><th>Margem</th><th>Promoção</th></tr></thead>
                <tbody>
                  {visible.map((product) => {
                    const status = statusOf(product);
                    return (
                      <tr key={product.id} className={selected.has(product.id) ? "selected" : undefined} onClick={() => toggle(product.id)}>
                        <td><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} onClick={(event) => event.stopPropagation()} aria-label={`Selecionar ${product.name}`} /></td>
                        <td><b>{product.name}</b><small>{product.sku} · {product.category}</small></td>
                        <td className="num">{brl(product.price)}</td>
                        <td className="num">{brl(product.cost)}</td>
                        <td className="num">{pct(marginAt(product.price, product.cost))}</td>
                        <td>{status !== "sem" ? <em className={statusTag[status]}>{status} -{String(product.promoPercent).replace(".", ",")}%</em> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <form id="promo-form" className="preset-form promo-form" onSubmit={applyPromo}>
            <h2>Preço promocional</h2>
            <p className="settings-intro">{chosen.length ? `${chosen.length} produto(s) escolhido(s).` : "Escolha os produtos na lista."} O desconto vale para todos os tamanhos e aparece na loja como &quot;de/por&quot; durante o período.</p>
            <div className="form-grid">
              <label>Desconto (%)<input inputMode="decimal" value={promo.percent} onChange={(event) => setPromo({ ...promo, percent: event.target.value })} placeholder="15" /></label>
              <label>Nome na loja<input value={promo.label} maxLength={40} onChange={(event) => setPromo({ ...promo, label: event.target.value })} placeholder="Black Friday" /></label>
            </div>
            <div className="form-grid">
              <label>Começa em (opcional)<input type="datetime-local" value={promo.startsAt} onChange={(event) => setPromo({ ...promo, startsAt: event.target.value })} /></label>
              <label>Termina em (opcional)<input type="datetime-local" value={promo.endsAt} onChange={(event) => setPromo({ ...promo, endsAt: event.target.value })} /></label>
            </div>
            {percent > 0 && preview.length ? (
              <div className="promo-preview">
                {belowCost.length ? <p className="sim-alert sim-bad"><strong>Abaixo do custo:</strong> {belowCost.map((row) => `${row.product.sku} (${brl(row.promoPrice)} < custo ${brl(row.product.cost)})`).join(", ")}</p> : null}
                {belowTarget.length ? <p className="sim-alert sim-warning"><strong>Margem abaixo de {TARGET_MARGIN}%:</strong> {belowTarget.map((row) => `${row.product.sku} (${pct(row.margin)})`).join(", ")}</p> : null}
                {!belowCost.length && !belowTarget.length ? <p className="sim-alert sim-good">Todos os escolhidos mantêm margem de {TARGET_MARGIN}% ou mais.</p> : null}
                <ul>
                  {preview.slice(0, 8).map((row) => (
                    <li key={row.product.id}><span>{row.product.name}</span><span className="num"><s>{brl(row.product.price)}</s> → <b>{brl(row.promoPrice)}</b> · {pct(row.margin)}</span></li>
                  ))}
                  {preview.length > 8 ? <li><span>e mais {preview.length - 8}</span></li> : null}
                </ul>
              </div>
            ) : null}
            <button className="primary-button" type="submit" disabled={!chosen.length}>Aplicar a {chosen.length || "0"} produto(s)</button>
          </form>
        </div>

        <h2 className="today-section-title">Cupons</h2>
        <div className="promo-layout">
          <section className="preset-form">
            {coupons.length ? (
              <div className="promo-table-wrap">
                <table className="promo-table">
                  <thead><tr><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Validade</th><th>Usos</th><th>Situação</th><th aria-label="Ações" /></tr></thead>
                  <tbody>
                    {coupons.map((coupon) => {
                      const status = couponStatus(couponDates(coupon));
                      return (
                        <tr key={coupon.id}>
                          <td><b>{coupon.code}</b>{coupon.notes ? <small>{coupon.notes}</small> : null}</td>
                          <td>{couponLabel(coupon)}</td>
                          <td className="num">{coupon.minOrder ? brl(coupon.minOrder) : "—"}</td>
                          <td>{period(coupon.startsAt, coupon.endsAt)}</td>
                          <td className="num">{coupon.uses}{coupon.maxUses ? ` de ${coupon.maxUses}` : ""}</td>
                          <td><em className={statusTag[status]}>{status}</em></td>
                          <td className="promo-actions">
                            <button type="button" className="link-button" onClick={() => editCoupon(coupon)}>Editar</button>
                            <button type="button" className="link-button" onClick={() => void toggleCoupon(coupon)}>{coupon.active ? "Pausar" : "Ativar"}</button>
                            <button type="button" className="link-button" onClick={() => void deleteCoupon(coupon)}>Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="today-empty">Nenhum cupom ainda. Crie um ao lado (ex.: BLACK10 para a Black Friday).</p>}
          </section>

          <form id="coupon-form" className="preset-form promo-form" onSubmit={saveCoupon}>
            <h2>{editingCoupon ? "Editar cupom" : "Novo cupom"}</h2>
            <div className="form-grid">
              <label>Código<input value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="BLACK10" required /></label>
              <label>Tipo
                <select value={couponForm.kind} onChange={(event) => setCouponForm({ ...couponForm, kind: event.target.value as "PERCENT" | "FIXED" })}>
                  <option value="PERCENT">% do total</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>{couponForm.kind === "PERCENT" ? "Desconto (%)" : "Desconto (R$)"}<input inputMode="decimal" value={couponForm.value} onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })} placeholder={couponForm.kind === "PERCENT" ? "10" : "15,00"} required /></label>
              <label>Compra mínima (R$, opcional)<input inputMode="decimal" value={couponForm.minOrder} onChange={(event) => setCouponForm({ ...couponForm, minOrder: event.target.value })} placeholder="80,00" /></label>
            </div>
            <div className="form-grid">
              <label>Começa em (opcional)<input type="datetime-local" value={couponForm.startsAt} onChange={(event) => setCouponForm({ ...couponForm, startsAt: event.target.value })} /></label>
              <label>Termina em (opcional)<input type="datetime-local" value={couponForm.endsAt} onChange={(event) => setCouponForm({ ...couponForm, endsAt: event.target.value })} /></label>
            </div>
            <div className="form-grid">
              <label>Limite de usos (opcional)<input inputMode="numeric" value={couponForm.maxUses} onChange={(event) => setCouponForm({ ...couponForm, maxUses: event.target.value })} placeholder="50" /></label>
              <label>Observação (só aqui)<input value={couponForm.notes} maxLength={200} onChange={(event) => setCouponForm({ ...couponForm, notes: event.target.value })} placeholder="Divulgado no Instagram" /></label>
            </div>
            <label className="checkbox-field"><input type="checkbox" checked={couponForm.active} onChange={(event) => setCouponForm({ ...couponForm, active: event.target.checked })} /> Ativo</label>
            {couponRisk ? <p className="sim-alert sim-warning">Com {couponValue}% de cupom, {couponRisk} produto(s) da vitrine ficam com margem abaixo de {TARGET_MARGIN}% (sem contar promoções e desconto por quantidade, que somam).</p> : null}
            <div className="form-actions">
              <button className="primary-button" type="submit">{editingCoupon ? "Salvar cupom" : "Criar cupom"}</button>
              {editingCoupon ? <button className="secondary-button" type="button" onClick={() => { setEditingCoupon(null); setCouponForm(emptyCoupon); }}>Cancelar</button> : null}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
