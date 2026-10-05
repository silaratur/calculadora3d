"use client";

import { FormEvent, useEffect, useState } from "react";
import { IconTrash, IconX } from "@/components/Icons";
import { brl } from "@/lib/money";

export type PurchaseTarget =
  | { kind: "material"; id: string; name: string; perGram: number; unitWeightGrams: number }
  | { kind: "supply"; id: string; name: string; perUnit: number };

type PurchaseRow = { id: string; kind: "material" | "supply"; date: string; quantity: number; unit: string; totalPaid: number; supplier: string; inCash: boolean };

const todayLocal = () => { const now = new Date(); const pad = (v: number) => String(v).padStart(2, "0"); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
const num = (value: string) => {
  const clean = value.replace(/R\$\s?/g, "").replace(/\s/g, "");
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean) || 0;
};
const brl4 = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * "Registrar compra" de um filamento ou insumo da Biblioteca: lança o custo
 * variável e a saída no Caixa, atualiza o custo do item e (filamento) o estoque.
 */
export function PurchaseDialog({ target, onClose, onSaved }: { target: PurchaseTarget; onClose: () => void; onSaved: (message: string) => void }) {
  const isMaterial = target.kind === "material";
  const [form, setForm] = useState({ date: todayLocal(), quantity: isMaterial ? String(target.unitWeightGrams) : "", totalPaid: "", supplier: "", purchaseLink: "", updatePrice: true });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PurchaseRow[]>([]);
  const [historyToken, setHistoryToken] = useState(0);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/purchases?kind=${target.kind}&itemId=${encodeURIComponent(target.id)}`);
      if (response.ok) setHistory((await response.json()) as PurchaseRow[]);
    }
    void load();
  }, [target.kind, target.id, historyToken]);

  const quantity = num(form.quantity);
  const total = num(form.totalPaid);
  const newUnit = quantity > 0 && total > 0 ? total / quantity : 0;
  const currentUnit = isMaterial ? target.perGram : target.perUnit;
  const unitLabel = isMaterial ? "por grama" : "por unidade";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!quantity || !total) { setError(isMaterial ? "Informe os gramas comprados e o valor pago." : "Informe a quantidade e o valor pago."); return; }
    setSaving(true);
    setError("");
    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: target.kind, itemId: target.id, date: form.date, quantity, totalPaid: total, supplier: form.supplier, purchaseLink: form.purchaseLink.trim(), updatePrice: form.updatePrice }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(typeof body.error === "string" ? body.error : "Não foi possível registrar a compra."); return; }
    onSaved(`Compra de ${target.name} registrada: ${brl(total)} em Custos variáveis e no Caixa${form.updatePrice ? `; custo atualizado para ${brl4(newUnit)} ${unitLabel}` : ""}${isMaterial ? `; +${quantity.toLocaleString("pt-BR")} g no estoque` : ""}.`);
  }

  async function undo(row: PurchaseRow) {
    if (!window.confirm(`Desfazer a compra de ${brl(row.totalPaid)}? Sai de Custos variáveis e do Caixa${row.kind === "material" ? " e o peso volta do estoque" : ""}. O custo do item na Biblioteca não muda.`)) return;
    const response = await fetch(`/api/purchases?kind=${row.kind}&id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Não foi possível desfazer."); return; }
    setHistoryToken((token) => token + 1);
    onSaved(`Compra de ${brl(row.totalPaid)} desfeita.`);
  }

  return (
    <div className="purchase-backdrop" role="dialog" aria-modal="true" aria-label={`Registrar compra de ${target.name}`} onClick={onClose}>
      <form className="purchase-dialog" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="purchase-kicker">Registrar compra · {isMaterial ? "Filamento" : "Insumo"}</span>
            <h2>{target.name}</h2>
          </div>
          <button type="button" className="purchase-close" onClick={onClose} aria-label="Fechar"><IconX className="nav-icon" /></button>
        </header>

        <div className="form-grid">
          <label>{isMaterial ? "Quantidade comprada (g)" : "Quantidade (unidades)"}<input required inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder={isMaterial ? "1000" : "50"} /></label>
          <label>Valor total pago (R$)<input required inputMode="decimal" value={form.totalPaid} onChange={(event) => setForm({ ...form, totalPaid: event.target.value })} placeholder="0,00" /></label>
        </div>
        <div className="form-grid">
          <label>Data da compra<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Loja / fornecedor<input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} placeholder="Ex: Shopee – Loja X" /></label>
        </div>
        <label>Link da compra (opcional)<input type="url" value={form.purchaseLink} onChange={(event) => setForm({ ...form, purchaseLink: event.target.value })} placeholder="https://" /></label>

        <div className="purchase-preview">
          <div><span>Custo atual</span><strong>{brl4(currentUnit)} <small>{unitLabel}</small></strong></div>
          <div><span>Nesta compra</span><strong>{newUnit ? brl4(newUnit) : "—"} <small>{unitLabel}</small></strong></div>
        </div>
        <label className="purchase-check"><input type="checkbox" checked={form.updatePrice} onChange={(event) => setForm({ ...form, updatePrice: event.target.checked })} /> Atualizar o custo na Biblioteca com o desta compra (novos cálculos de preço usam ele)</label>
        <p className="purchase-note">Ao registrar: {brl(total)} entra em <strong>Custos → {isMaterial ? "Filamento" : "Insumos"}</strong> e sai do <strong>Caixa</strong> na data da compra{isMaterial ? "; o peso é somado ao estoque" : ""}.</p>

        {error ? <p className="purchase-error">{error}</p> : null}
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Registrando…" : "Registrar compra"}</button>
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
        </div>

        {history.length ? (
          <section className="purchase-history">
            <h3>Compras anteriores</h3>
            <ul>
              {history.slice(0, 8).map((row) => (
                <li key={row.id}>
                  <span>{new Date(row.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {row.quantity.toLocaleString("pt-BR")} {row.unit}{row.supplier ? ` · ${row.supplier}` : ""}</span>
                  <strong>{brl(row.totalPaid)}</strong>
                  {row.inCash ? <button type="button" className="delete-button" onClick={() => void undo(row)} aria-label="Desfazer compra"><IconTrash className="nav-icon" /></button> : <span className="purchase-old">sem lançamento</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </form>
    </div>
  );
}
