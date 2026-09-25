"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconDownload, IconFileText } from "@/components/Icons";
import { ProductPhotoLink } from "@/components/ProductPreview";
import { displayNumber, paymentStatusLabel, saleStage, saleStageLabel } from "@/lib/sales";

/**
 * Página da venda (fase 3): tudo de uma venda num lugar — etapa, peças,
 * pagamento e a próxima ação. O orçamento de origem fica ligado (mesmo número),
 * mas só pra consulta: depois de aprovado ele não muda mais.
 */

type Payment = { id: string; date: string; amount: number; method: string; notes: string; reversedAt: string | null };
type Item = {
  id: string;
  name: string;
  quantity: number;
  status: string;
  completedAt: string | null;
  product: { id: string; imageUrl: string; material: string; printTimeHours: number } | null;
};
type Order = {
  id: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  channel: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalAmount: number;
  paidAmount: number;
  shippingCost: number;
  dueDate: string | null;
  plannedProductionDate: string | null;
  expectedPaymentDate: string | null;
  deliveredAt: string | null;
  notes: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string; email: string } | null;
  quote: { id: string; code: string | null; revision: number; createdAt: string } | null;
  payments: Payment[];
  production: { status: string; completedAt: string | null; items: Item[] } | null;
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;
const fmtDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("pt-BR") : null);
const itemStatusLabel: Record<string, string> = { WAITING: "Na fila", PRINTING: "Imprimindo", FINISHING: "Acabamento", COMPLETED: "Concluída" };

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "login">("loading");
  const [feedback, setFeedback] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders?id=${encodeURIComponent(params.id)}`, { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) { setStatus("login"); return; }
      if (!response.ok) { setStatus("notfound"); return; }
      setOrder((await response.json()) as Order);
      setStatus("ok");
    });
    return () => { cancelled = true; };
  }, [params.id, reloadToken]);

  async function setDelivered(delivered: boolean) {
    if (!order) return;
    const response = await fetch(`/api/orders?id=${encodeURIComponent(order.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivered }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setFeedback(typeof body?.error === "string" ? body.error : "Não foi possível atualizar a entrega."); return; }
    setFeedback(delivered ? "Entrega registrada." : "Entrega desfeita — a venda voltou para Aguardando entrega.");
    reload();
  }

  async function registerReceipt() {
    if (!order) return;
    const pending = order.totalAmount - order.paidAmount;
    // Campo vazio = recebe tudo o que falta (o valor mostrado no placeholder).
    const amount = receiptAmount.trim() ? n(receiptAmount) : pending;
    if (!amount || amount <= 0) { setFeedback("Informe um valor a receber válido."); return; }
    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, amount }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível registrar o recebimento."); return; }
    setFeedback(`Recebimento de ${brl(amount)} registrado — já entrou no Caixa.`);
    setReceiptAmount("");
    reload();
  }

  async function reversePayment(payment: Payment) {
    if (!window.confirm(`Estornar o recebimento de ${brl(payment.amount)} de ${fmtDate(payment.date)}? O valor volta como pendente e sai do Caixa.`)) return;
    const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/reverse`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setFeedback(body?.error ?? "Não foi possível estornar o recebimento."); return; }
    setFeedback(`Recebimento de ${brl(payment.amount)} estornado.`);
    reload();
  }

  if (status === "login") {
    return (
      <main className="admin-shell">
        <AdminHeader active="sales" />
        <div className="admin-content"><AuthBanner message="Entre novamente para ver esta venda." /></div>
      </main>
    );
  }
  if (status !== "ok" || !order) {
    return (
      <main className="admin-shell">
        <AdminHeader active="sales" />
        <div className="admin-content">
          <p className="library-loading">{status === "loading" ? "Carregando..." : "Venda não encontrada."}</p>
          <Link className="sale-back" href="/sales">← Voltar para Vendas</Link>
        </div>
      </main>
    );
  }

  const stage = saleStage(order);
  const pending = Math.max(order.totalAmount - order.paidAmount, 0);
  const items = order.production?.items ?? [];
  const doneItems = items.filter((item) => item.status === "COMPLETED").length;
  const lastItemDone = items.reduce<string | null>((latest, item) => (item.completedAt && (!latest || item.completedAt > latest) ? item.completedAt : latest), null);

  // Linha do tempo: orçamento (se veio de um) → aprovado → em produção → aguardando entrega → entregue.
  const steps = [
    ...(order.quote ? [{ label: "Orçamento", detail: `${fmtDate(order.quote.createdAt)}${order.quote.revision > 1 ? ` · ${order.quote.revision} revisões` : ""}`, done: true, now: false }] : []),
    { label: order.quote ? "Aprovado" : "Venda registrada", detail: fmtDate(order.createdAt) ?? "", done: true, now: false },
    { label: "Em produção", detail: `${doneItems}/${items.length} peças concluídas`, done: stage !== "PRODUCING", now: stage === "PRODUCING" },
    { label: "Aguardando entrega", detail: stage === "PRODUCING" ? "" : `desde ${fmtDate(lastItemDone ?? order.production?.completedAt) ?? "—"}`, done: stage === "DELIVERED", now: stage === "AWAITING_DELIVERY" },
    { label: "Entregue", detail: fmtDate(order.deliveredAt) ?? "", done: stage === "DELIVERED", now: false },
  ];

  return (
    <main className="admin-shell">
      <AdminHeader active="sales" />
      <div className="admin-content sale-detail">
        <Link className="sale-back" href="/sales">← Vendas</Link>

        <section className="library-heading">
          <div>
            <h1>{order.productName}</h1>
            <p>
              <strong>{displayNumber(order.orderNumber)}</strong> · {order.customer?.name || "Cliente não informado"} · {order.channel} · {brl(order.totalAmount)}
            </p>
          </div>
          <div className="sale-chips">
            <span className={`sale-stage stage-${stage.toLowerCase()}`}>{saleStageLabel[stage]}</span>
            <span className={`sale-pay pay-${order.paymentStatus.toLowerCase()}`}>{paymentStatusLabel[order.paymentStatus] ?? order.paymentStatus}</span>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <ol className="sale-timeline" aria-label="Etapas da venda">
          {steps.map((step) => (
            <li key={step.label} className={step.now ? "now" : step.done ? "done" : undefined}>
              <strong>{step.label}</strong>
              {step.detail ? <span>{step.detail}</span> : null}
            </li>
          ))}
        </ol>

        <div className="sale-next">
          {stage === "AWAITING_DELIVERY" ? (
            <>
              <p>Todas as peças estão prontas. Entregou ao cliente?</p>
              <button className="primary-button" type="button" onClick={() => void setDelivered(true)}>Registrar entrega</button>
            </>
          ) : stage === "PRODUCING" ? (
            <>
              <p>{items.length - doneItems === 1 ? "Falta 1 peça" : `Faltam ${items.length - doneItems} peças`} na Produção. A entrega libera quando todas estiverem concluídas.</p>
              <Link className="secondary-button" href="/production">Abrir Produção</Link>
            </>
          ) : (
            <>
              <p>Entregue em {fmtDate(order.deliveredAt)}.{pending > 0.01 ? ` Ainda falta receber ${brl(pending)}.` : ""}</p>
              <button className="secondary-button" type="button" onClick={() => void setDelivered(false)}>Desfazer entrega</button>
            </>
          )}
        </div>

        <div className="sale-grid">
          <section className="sale-panel">
            <header><h2>Peças</h2><span>{doneItems}/{items.length} concluídas</span></header>
            {items.length ? (
              <ul className="sale-items">
                {items.map((item) => (
                  <li key={item.id}>
                    {item.product?.imageUrl ? (
                      <ProductPhotoLink productId={item.product.id} name={item.name} image={item.product.imageUrl}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso */}
                        <img src={item.product.imageUrl} alt={item.name} />
                      </ProductPhotoLink>
                    ) : <span className="sale-item-photo-empty" aria-hidden="true" />}
                    <span className="sale-item-main">
                      <strong>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
                      {item.product?.material ? <small>{item.product.material}</small> : null}
                    </span>
                    <span className={`sale-item-status status-${item.status.toLowerCase()}`}>{itemStatusLabel[item.status] ?? item.status}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="today-empty">Esta venda não tem peças na Produção.</p>}
          </section>

          <section className="sale-panel">
            <header><h2>Pagamento</h2><span>{order.paymentMethod}</span></header>
            <div className="sale-money">
              <div><span>Total</span><strong className="num">{brl(order.totalAmount)}</strong></div>
              <div><span>Recebido</span><strong className="num">{brl(order.paidAmount)}</strong></div>
              <div><span>Falta</span><strong className={pending > 0.01 ? "num negative" : "num"}>{brl(pending)}</strong></div>
            </div>
            {pending > 0.01 ? (
              <div className="sale-receipt">
                <label>Valor recebido (R$)
                  <input inputMode="decimal" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} placeholder={pending.toFixed(2).replace(".", ",")} />
                </label>
                <button className="primary-button" type="button" onClick={() => void registerReceipt()}>Registrar recebimento</button>
                <small>Vazio = recebe tudo o que falta. {order.expectedPaymentDate ? `Previsto para ${fmtDate(order.expectedPaymentDate)}.` : ""}</small>
              </div>
            ) : null}
            {order.payments.length ? (
              <ul className="sale-payments">
                {order.payments.map((payment) => (
                  <li key={payment.id} className={payment.reversedAt ? "reversed" : undefined}>
                    <span>{fmtDate(payment.date)} · {payment.method}</span>
                    <strong className="num">{brl(payment.amount)}</strong>
                    {payment.reversedAt ? <small>estornado em {fmtDate(payment.reversedAt)}</small> : (
                      <button className="edit-button" type="button" onClick={() => void reversePayment(payment)}>Estornar</button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="today-empty">Nenhum recebimento ainda. O dinheiro só entra no Caixa quando você registra aqui.</p>}
          </section>

          <section className="sale-panel">
            <header><h2>Detalhes</h2></header>
            <dl className="sale-facts">
              <div><dt>Prazo de entrega</dt><dd>{fmtDate(order.dueDate) ?? "sem prazo"}</dd></div>
              <div><dt>Produção prevista</dt><dd>{fmtDate(order.plannedProductionDate) ?? "—"}</dd></div>
              <div><dt>Frete pago pela empresa</dt><dd className="num">{brl(order.shippingCost)}</dd></div>
              {order.customer?.phone ? <div><dt>Telefone</dt><dd>{order.customer.phone}</dd></div> : null}
              {order.customer?.email ? <div><dt>E-mail</dt><dd>{order.customer.email}</dd></div> : null}
            </dl>
            {order.quote ? (
              <div className="sale-quote-links">
                <a href={`/quotes/${order.quote.id}/print`} target="_blank" rel="noreferrer"><IconDownload className="nav-icon" /> PDF do orçamento</a>
                <a href={`/orcamentos?quoteId=${order.quote.id}`}><IconFileText className="nav-icon" /> Ver orçamento aprovado</a>
              </div>
            ) : null}
            {order.notes ? <p className="sale-notes">{order.notes}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
