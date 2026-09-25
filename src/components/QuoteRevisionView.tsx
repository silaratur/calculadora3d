"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@/components/Icons";

/**
 * Mostra uma revisão antiga do orçamento EXATAMENTE como foi salva — itens,
 * quantidades, custos e totais do snapshot daquela hora, sem recalcular com o
 * Catálogo de hoje (o "Restaurar" recalcula; isto aqui não).
 */

export type RevisionToView = {
  number: number;
  createdAt: string;
  productName: string;
  finalPrice: number;
  baseCost?: number;
  snapshotJson: string;
  notes: string;
};

type Snapshot = {
  products?: { id?: string; name?: string; quantity?: number; unitCost?: number; printTimeHours?: number; imageUrl?: string }[];
  supplies?: { name?: string; category?: string; quantity?: number; unitCost?: number }[];
  customExtras?: { name?: string; unitCost?: number }[];
  markup?: string;
  discount?: string;
  pricingMethod?: string;
  marketplace?: { name?: string; commissionRate?: number; adsRate?: number; fixedFee?: number };
  calculations?: { printTime?: number; productsCost?: number; suppliesCost?: number; costWithReserve?: number; price?: number; profit?: number };
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (value: unknown) => Number(String(value ?? 0).replace(",", ".")) || 0;
const fmtHours = (hours: number) => `${Math.floor(hours)}h${String(Math.round((hours % 1) * 60)).padStart(2, "0")}`;

export function QuoteRevisionView({ revision, onClose, onRestore }: { revision: RevisionToView; onClose: () => void; onRestore?: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  let snapshot: Snapshot = {};
  try { snapshot = JSON.parse(revision.snapshotJson) as Snapshot; } catch { snapshot = {}; }
  const products = snapshot.products ?? [];
  const supplies = snapshot.supplies ?? [];
  const extras = snapshot.customExtras ?? [];
  const calc = snapshot.calculations ?? {};
  const productsRealCost = products.reduce((sum, item) => sum + num(item.unitCost) * (num(item.quantity) || 1), 0);
  const suppliesCost = supplies.reduce((sum, item) => sum + num(item.unitCost) * (num(item.quantity) || 1), 0);
  const extrasCost = extras.reduce((sum, item) => sum + num(item.unitCost), 0);
  const printTime = calc.printTime ?? products.reduce((sum, item) => sum + num(item.printTimeHours) * (num(item.quantity) || 1), 0);
  const channel = snapshot.marketplace;
  const saved = new Date(revision.createdAt);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card revision-view" role="dialog" aria-modal="true" aria-label={`Revisão ${revision.number}`} onClick={(event) => event.stopPropagation()}>
        <header className="revision-view-head">
          <div>
            <h2>Revisão {revision.number}</h2>
            <p>Como estava em {saved.toLocaleDateString("pt-BR")} às {saved.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <button type="button" className="theme-toggle" onClick={onClose} aria-label="Fechar"><IconX className="nav-icon" /></button>
        </header>

        <p className="revision-view-name">{revision.productName}</p>

        <section>
          <h3>Produtos do Catálogo</h3>
          {products.length ? (
            <table className="revision-table">
              <thead><tr><th>Produto</th><th>Qtd.</th><th>Custo un.</th><th>Custo total</th><th>Tempo</th></tr></thead>
              <tbody>
                {products.map((item, index) => {
                  const qty = num(item.quantity) || 1;
                  return (
                    <tr key={index}>
                      <td className="revision-product">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="revision-photo-empty" aria-hidden="true" />}
                        {item.name}
                      </td>
                      <td className="num">{qty}</td>
                      <td className="num">{brl(num(item.unitCost))}</td>
                      <td className="num">{brl(num(item.unitCost) * qty)}</td>
                      <td className="num">{fmtHours(num(item.printTimeHours) * qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="today-empty">Nenhum produto nesta revisão.</p>}
        </section>

        {supplies.length ? (
          <section>
            <h3>Insumos e acessórios</h3>
            <table className="revision-table">
              <thead><tr><th>Insumo</th><th>Qtd.</th><th>Custo un.</th><th>Total</th></tr></thead>
              <tbody>
                {supplies.map((item, index) => {
                  const qty = num(item.quantity) || 1;
                  return <tr key={index}><td>{item.name}</td><td className="num">{qty}</td><td className="num">{brl(num(item.unitCost))}</td><td className="num">{brl(num(item.unitCost) * qty)}</td></tr>;
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        {extras.length ? (
          <section>
            <h3>Itens personalizados</h3>
            <table className="revision-table">
              <tbody>{extras.map((item, index) => <tr key={index}><td>{item.name}</td><td className="num">{brl(num(item.unitCost))}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null}

        <section className="revision-summary">
          <h3>Precificação</h3>
          <dl>
            <div><dt>Canal</dt><dd>{channel?.name ?? "Venda Direta"}{channel && (num(channel.commissionRate) || num(channel.adsRate)) ? ` (${((num(channel.commissionRate) + num(channel.adsRate)) * 100).toFixed(1).replace(".", ",")}% de taxas)` : ""}</dd></div>
            <div><dt>{snapshot.pricingMethod === "margin" ? "Margem aplicada" : "Markup aplicado"}</dt><dd>{snapshot.markup ?? "—"}%</dd></div>
            {num(snapshot.discount) > 0 ? <div><dt>Desconto</dt><dd className="num">{brl(num(snapshot.discount))}</dd></div> : null}
            <div><dt>Tempo total de impressão</dt><dd className="num">{fmtHours(printTime)}</dd></div>
            <div><dt>Custo real (produtos + insumos + extras)</dt><dd className="num">{brl(productsRealCost + suppliesCost + extrasCost)}</dd></div>
            {calc.costWithReserve !== undefined ? <div><dt>Base do cálculo (preço de venda dos produtos + insumos)</dt><dd className="num">{brl(calc.costWithReserve)}</dd></div> : null}
            <div className="total"><dt>Preço final</dt><dd className="num">{brl(revision.finalPrice)}</dd></div>
          </dl>
        </section>

        {revision.notes ? (
          <section>
            <h3>Observações</h3>
            <p className="revision-notes">{revision.notes}</p>
          </section>
        ) : null}

        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Fechar</button>
          {onRestore ? <button className="primary-button" type="button" onClick={onRestore}>Restaurar esta revisão</button> : null}
        </div>
        {onRestore ? <p className="revision-view-hint">Restaurar carrega estes itens no editor e recalcula com os preços atuais do Catálogo; ao salvar, vira uma nova revisão.</p> : null}
      </div>
    </div>,
    document.body,
  );
}
