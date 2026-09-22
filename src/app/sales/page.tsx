"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { assessMargin, assessProfitPerHour, calculateOrderMetrics } from "@/lib/costing";

type Customer = { id: string; name: string };
type Product = { id: string; sku: string; name: string; cost: number; price: number; printTimeHours: number; active: boolean };
type Channel = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number };
type Settings = { defaultMarkup: number; laborRate: number };
type Order = {
  id: string;
  orderNumber: string;
  productId: string | null;
  productName: string;
  quantity: number;
  channel: string;
  channelId: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  unitPrice: number;
  unitCostSnapshot: number;
  discountPerUnit: number;
  marketplaceFee: number;
  shippingCost: number;
  totalAmount: number;
  paidAmount: number;
  customerId: string | null;
  dueDate: string | null;
  plannedProductionDate: string | null;
  expectedPaymentDate: string | null;
  createdAt: string;
  customer?: Customer | null;
  product?: Product | null;
};

type Payment = { id: string; orderId: string; date: string; amount: number; method: string; notes: string; reversedAt: string | null };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (value: string) => Number(value.replace(",", ".")) || 0;
const dateValue = (value: string | null) => (value ? value.slice(0, 10) : "");

const emptyForm = {
  productId: "",
  productName: "",
  unitPrice: "",
  quantity: "1",
  customerId: "",
  channelId: "",
  discountPerUnit: "0",
  shippingCost: "0",
  paymentMethod: "PIX",
  dueDate: "",
  plannedProductionDate: "",
  expectedPaymentDate: "",
};

const paymentMethods = ["PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Boleto"];
const productionStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];
const financialStatuses = ["PENDING", "PARTIAL", "PAID"];
const statusLabel: Record<string, string> = { PENDING: "Falta produzir", IN_PROGRESS: "Em produção", COMPLETED: "Produzido" };
const paymentLabel: Record<string, string> = { PENDING: "Falta receber", PARTIAL: "Parcialmente recebido", PAID: "Recebido" };

export default function SalesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<Settings>({ defaultMarkup: 40, laborRate: 25 });
  const [form, setForm] = useState(emptyForm);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  // Ao carregar a tela, esconde os já produzidos por padrão — só quem ainda
  // está na fila (falta produzir/em produção) precisa de atenção aqui. O
  // usuário pode trocar pra "Produzido" ou "Todos" no filtro quando quiser.
  const [statusFilter, setStatusFilter] = useState("active");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [orderPayments, setOrderPayments] = useState<Payment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    if (!expandedOrder) return;
    let cancelled = false;
    fetch(`/api/payments?orderId=${encodeURIComponent(expandedOrder)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Payment[]) => { if (!cancelled) setOrderPayments(data); });
    return () => { cancelled = true; };
  }, [expandedOrder, reloadToken]);

  useEffect(() => {
    async function load() {
      const [orderRes, customerRes, productRes, channelRes, settingsRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/customers"),
        fetch("/api/products"),
        fetch("/api/marketplaces"),
        fetch("/api/settings"),
      ]);
      if (orderRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (orderRes.ok) setOrders((await orderRes.json()) as Order[]);
      if (customerRes.ok) setCustomers((await customerRes.json()) as Customer[]);
      if (productRes.ok) setProducts((await productRes.json()) as Product[]);
      if (channelRes.ok) setChannels((await channelRes.json()) as Channel[]);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as Settings);
    }
    void load();
  }, [reloadToken]);

  const product = products.find((item) => item.id === form.productId);
  const channel = channels.find((item) => item.id === form.channelId);
  const quantity = n(form.quantity);
  // Venda avulsa (sem produto do catálogo) não tem de onde puxar o preço —
  // usa o que foi digitado no campo "Preço unitário".
  const unitPrice = product?.price ?? n(form.unitPrice);
  const marketplaceFee = channel ? unitPrice * channel.commissionRate + channel.adsRate * unitPrice : 0;

  const metrics = useMemo(
    () =>
      calculateOrderMetrics({
        quantity,
        unitPrice,
        unitCost: product?.cost ?? 0,
        discountPerUnit: n(form.discountPerUnit),
        marketplaceFee,
        shippingCost: n(form.shippingCost),
        printTimeHours: product?.printTimeHours ?? 0,
      }),
    [quantity, unitPrice, product, form.discountPerUnit, marketplaceFee, form.shippingCost],
  );
  const marginAssessment = assessMargin(metrics.marginPercent, settings.defaultMarkup);
  const hourAssessment = assessProfitPerHour(metrics.profitPerHour, settings.laborRate);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.productId && !form.productName) { setFeedback("Selecione um produto do catálogo ou informe o nome."); return; }
    if (!form.productId && !n(form.unitPrice)) { setFeedback("Informe o preço unitário da venda avulsa."); return; }
    const url = editingId ? `/api/orders?id=${encodeURIComponent(editingId)}` : "/api/orders";
    const response = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: form.productId || null,
        productName: form.productId ? undefined : form.productName,
        // Produto do catálogo sempre usa o preço do catálogo (não reenvia);
        // venda avulsa não tem outro lugar de onde o servidor possa puxar o
        // preço, então precisa mandar explicitamente.
        unitPrice: form.productId ? undefined : n(form.unitPrice),
        quantity,
        customerId: form.customerId || null,
        channelId: form.channelId || null,
        discountPerUnit: n(form.discountPerUnit),
        marketplaceFee,
        shippingCost: n(form.shippingCost),
        paymentMethod: form.paymentMethod,
        dueDate: form.dueDate || null,
        plannedProductionDate: form.plannedProductionDate || null,
        expectedPaymentDate: form.expectedPaymentDate || null,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFeedback(typeof body?.error === "string" ? body.error : `Não foi possível ${editingId ? "atualizar" : "criar"} o pedido.`);
      return;
    }
    setFeedback(editingId ? "Pedido atualizado." : "Pedido criado e enviado para produção.");
    setForm(emptyForm);
    setEditingId(null);
    reload();
  }

  function edit(order: Order) {
    if (order.paidAmount > 0) { setFeedback("Este pedido já tem recebimento registrado — não é possível editar produto, quantidade ou valores."); return; }
    setEditingId(order.id);
    setForm({
      productId: order.productId ?? "",
      productName: order.productId ? "" : order.productName,
      unitPrice: order.productId ? "" : String(order.unitPrice),
      quantity: String(order.quantity),
      customerId: order.customerId ?? "",
      channelId: order.channelId ?? "",
      discountPerUnit: String(order.discountPerUnit),
      shippingCost: String(order.shippingCost),
      paymentMethod: order.paymentMethod,
      dueDate: dateValue(order.dueDate),
      plannedProductionDate: dateValue(order.plannedProductionDate),
      expectedPaymentDate: dateValue(order.expectedPaymentDate),
    });
    document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback("");
  }

  async function archive(id: string) {
    if (!window.confirm("Excluir este pedido? A produção associada também será removida.")) return;
    await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (editingId === id) cancelEdit();
    reload();
  }

  async function registerReceipt(order: Order) {
    const pending = order.totalAmount - order.paidAmount;
    // Campo vazio = usa o valor pendente (o mesmo número mostrado no
    // placeholder) — clicar em "Registrar Recebimento" sem digitar nada
    // registra o valor total que falta, em vez de falhar em silêncio.
    const amount = receiptAmount.trim() ? n(receiptAmount) : pending;
    if (!amount || amount <= 0) { setFeedback("Informe um valor a receber válido."); return; }
    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, amount }),
    });
    const body = await response.json();
    if (!response.ok) { setFeedback(body.error ?? "Não foi possível registrar o recebimento."); return; }
    setFeedback(`Recebimento de ${brl(amount)} registrado em ${order.orderNumber}.`);
    setReceiptAmount("");
    reload();
  }

  async function reversePayment(payment: Payment, order: Order) {
    if (!window.confirm(`Estornar o recebimento de ${brl(payment.amount)} de ${dateValue(payment.date)}? Isso volta o valor como pendente e lança uma saída no fluxo de caixa.`)) return;
    const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/reverse`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) { setFeedback(body.error ?? "Não foi possível estornar o recebimento."); return; }
    setFeedback(`Recebimento de ${brl(payment.amount)} estornado em ${order.orderNumber}.`);
    reload();
  }

  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const text = `${order.orderNumber} ${order.productName} ${order.customer?.name ?? ""}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
        if (statusFilter === "active" && order.status === "COMPLETED") return false;
        if (statusFilter !== "all" && statusFilter !== "active" && order.status !== statusFilter) return false;
        if (paymentFilter !== "all" && order.paymentStatus !== paymentFilter) return false;
        return true;
      }),
    [orders, search, statusFilter, paymentFilter],
  );

  return (
    <main className="admin-shell">
      <AdminHeader active="sales" badges={{ sales: orders.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e registrar pedidos." /> : null}
        <section className="library-heading">
          <div>
            <h1>Vendas & Pedidos</h1>
            <p>Registre pedidos aprovados e acompanhe pagamentos.</p>
          </div>
          <span className="material-badge">{orders.length} pedidos</span>
        </section>

        <div className="operations-layout">
          <form id="order-form" className="preset-form" onSubmit={submit}>
            <h2>{editingId ? "Editar pedido" : "Novo pedido"}</h2>
            <label>
              Produto do catálogo
              <select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value, productName: "" })}>
                <option value="">Venda avulsa (sem cadastro)</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} — {brl(item.price)}</option>)}
              </select>
            </label>
            {!form.productId ? (
              <div className="form-grid">
                <label>Nome do produto<input required value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder="Produto fora do catálogo" /></label>
                <label>Preço unitário (R$)<input required inputMode="decimal" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} placeholder="0,00" /></label>
              </div>
            ) : null}
            <label>Cliente<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Cliente não informado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>

            <div className="form-grid">
              <label>Quantidade<input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
              <label>Canal<select value={form.channelId} onChange={(event) => setForm({ ...form, channelId: event.target.value })}><option value="">Venda Direta</option>{channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <label>Desconto por unidade (R$)<input inputMode="decimal" value={form.discountPerUnit} onChange={(event) => setForm({ ...form, discountPerUnit: event.target.value })} /></label>
              <label>Frete pago pela empresa (R$)<input inputMode="decimal" value={form.shippingCost} onChange={(event) => setForm({ ...form, shippingCost: event.target.value })} /></label>
            </div>
            <label>Forma de pagamento<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <div className="form-grid">
              <label>Data prevista de produção<input type="date" value={form.plannedProductionDate} onChange={(event) => setForm({ ...form, plannedProductionDate: event.target.value })} /></label>
              <label>Data prevista de recebimento<input type="date" value={form.expectedPaymentDate} onChange={(event) => setForm({ ...form, expectedPaymentDate: event.target.value })} /></label>
            </div>

            {unitPrice > 0 ? (
              <div className="sim-panel">
                <span className="sim-title">Simulação em tempo real</span>
                <div className="sim-grid">
                  <div><span>Fat. Bruto</span><strong>{brl(metrics.grossRevenue)}</strong></div>
                  <div><span>Descontos + Taxas</span><strong>{brl(metrics.discountTotal + metrics.feesTotal)}</strong></div>
                  <div><span>Fat. Líquido</span><strong>{brl(metrics.netRevenue)}</strong></div>
                  <div><span>Custo Total</span><strong>{brl(metrics.totalCost)}</strong></div>
                  <div><span>Lucro Total</span><strong>{brl(metrics.profitTotal)}</strong></div>
                  <div><span>Lucro / Unid.</span><strong>{brl(metrics.profitPerUnit)}</strong></div>
                  <div><span>Lucro / Hora</span><strong>{brl(metrics.profitPerHour)}</strong></div>
                  <div><span>Tempo de Produção</span><strong>{metrics.totalPrintHours.toFixed(1)}h</strong></div>
                </div>
                <p className={`sim-alert sim-${marginAssessment.level}`}>{marginAssessment.message}</p>
                <p className={`sim-alert sim-${hourAssessment.level}`}>{hourAssessment.message}</p>
              </div>
            ) : null}

            <div className="form-actions">
              <button className="primary-button" type="submit">{editingId ? "Salvar alterações" : "Criar pedido"}</button>
              {editingId ? <button className="secondary-button" type="button" onClick={cancelEdit}>Cancelar</button> : null}
            </div>
            {feedback ? <p className="admin-feedback">{feedback}</p> : null}
          </form>

          <section className="operation-list">
            <div className="catalog-filters">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, produto ou cliente..." />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="active">Em produção e a produzir</option>
                <option value="all">Todos status de produção</option>
                {productionStatuses.map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
              </select>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                <option value="all">Todos status financeiros</option>
                {financialStatuses.map((item) => <option key={item} value={item}>{paymentLabel[item]}</option>)}
              </select>
            </div>

            {filtered.map((order) => {
              const pending = order.totalAmount - order.paidAmount;
              const expanded = expandedOrder === order.id;
              return (
                <article className="operation-card" key={order.id}>
                  <div className="card-top">
                    <span className="material-badge">{order.orderNumber}</span>
                    <span className="card-actions">
                      <span className="project-status">{statusLabel[order.status] ?? order.status}</span>
                      <button className="edit-button" onClick={() => edit(order)} disabled={order.paidAmount > 0} title={order.paidAmount > 0 ? "Pedido já recebeu pagamento — não pode ser editado" : undefined}>Editar</button>
                      <button className="edit-button" type="button" onClick={() => { setExpandedOrder(expanded ? null : order.id); setReceiptAmount(""); setFeedback(""); if (expanded) setOrderPayments([]); }}>
                        {expanded ? "Fechar" : order.paidAmount > 0 ? "Recebimentos" : "Receber"}
                      </button>
                      <button className="delete-button" onClick={() => archive(order.id)} aria-label={`Excluir ${order.orderNumber}`}><IconTrash className="nav-icon" /></button>
                    </span>
                  </div>
                  <h2>{order.productName}</h2>
                  <p>{order.customer?.name || "Cliente não informado"} · {order.quantity} unidade(s) · {order.channel} · {order.paymentMethod}</p>
                  <div className="operation-card-bottom">
                    <strong>{brl(order.totalAmount)}</strong>
                    <span>{paymentLabel[order.paymentStatus] ?? order.paymentStatus} {order.paidAmount > 0 ? `· ${brl(order.paidAmount)} recebido` : ""}</span>
                    <span>Entrega: {dateValue(order.dueDate) || "sem prazo"}</span>
                    <a href="/production">Acompanhar produção</a>
                  </div>

                  {expanded ? (
                    <div className="receivable-detail">
                      <div className="production-stats" style={{ marginBottom: 12 }}>
                        <div><span>Valor Total</span><strong>{brl(order.totalAmount)}</strong></div>
                        <div><span>Já Recebido</span><strong>{brl(order.paidAmount)}</strong></div>
                        <div><span>Pendente</span><strong>{brl(pending)}</strong></div>
                        <div><span>Forma Pagto.</span><strong>{order.paymentMethod}</strong></div>
                      </div>
                      {pending > 0.01 ? (
                        <>
                          <p className="card-detail">Data prevista de recebimento: {dateValue(order.expectedPaymentDate) || "sem previsão"}</p>
                          <div className="form-grid" style={{ alignItems: "end" }}>
                            <label>Valor a receber (R$)
                              <input inputMode="decimal" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} placeholder={pending.toFixed(2)} />
                            </label>
                            <button className="primary-button" type="button" onClick={() => void registerReceipt(order)}>Registrar Recebimento</button>
                          </div>
                        </>
                      ) : null}

                      {orderPayments.length > 0 ? (
                        <div className="payment-history">
                          <p className="card-detail">Histórico de recebimentos — estorne aqui um valor lançado por engano.</p>
                          {orderPayments.map((payment) => (
                            <div className={payment.reversedAt ? "payment-row reversed" : "payment-row"} key={payment.id}>
                              <span>{dateValue(payment.date)} · {payment.method}</span>
                              <strong>{brl(payment.amount)}</strong>
                              {payment.reversedAt ? (
                                <span className="card-detail">Estornado em {dateValue(payment.reversedAt)}</span>
                              ) : (
                                <button className="secondary-button" type="button" onClick={() => void reversePayment(payment, order)}>Estornar</button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {feedback ? <p className="admin-feedback">{feedback}</p> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {filtered.length === 0 ? <div className="empty-note">Nenhum pedido encontrado.</div> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
