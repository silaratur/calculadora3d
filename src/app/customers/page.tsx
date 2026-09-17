"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";

type CustomerOrder = { id: string; totalAmount: number; paidAmount: number; createdAt: string };
type Customer = { id: string; name: string; email: string; phone: string; notes: string; orders: CustomerOrder[] };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const emptyDraft = { name: "", email: "", phone: "", notes: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/customers");
      if (response.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (response.ok) setCustomers((await response.json()) as Customer[]);
    }
    void load();
  }, [reloadToken]);

  const filtered = useMemo(
    () => customers.filter((item) => `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(search.toLowerCase())),
    [customers, search],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(editingId ? `/api/customers?id=${encodeURIComponent(editingId)}` : "/api/customers", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) { setFeedback("Não foi possível salvar o cliente. Confira os campos."); return; }
    setFeedback(editingId ? "Cliente atualizado." : "Cliente cadastrado.");
    setDraft(emptyDraft);
    setEditingId(null);
    reload();
  }

  function edit(customer: Customer) {
    setEditingId(customer.id);
    setDraft({ name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes });
    document.getElementById("customer-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function archive(id: string) {
    if (!window.confirm("Desativar este cliente? O histórico de pedidos será preservado.")) return;
    await fetch(`/api/customers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (editingId === id) cancelEdit();
    reload();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="customers" badges={{ customers: customers.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e cadastrar clientes." /> : null}
        <section className="library-heading">
          <div>
            <h1>Clientes</h1>
            <p>Cadastro e histórico de compras de cada cliente.</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail ou telefone..." />
            <a className="new-quote-button" href="#customer-form">＋ Novo cliente</a>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <div className="library-layout">
          <form id="customer-form" className="preset-form" onSubmit={save}>
            <h2>{editingId ? "Editar cliente" : "Novo cliente"}</h2>
            <label>Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome completo" /></label>
            <div className="form-grid">
              <label>E-mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="cliente@email.com" /></label>
              <label>Telefone<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="(00) 00000-0000" /></label>
            </div>
            <label>Observações<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Preferências, endereço, combinados..." /></label>
            <div className="form-actions">
              <button className="primary-button" type="submit">{editingId ? "Salvar alterações" : "Cadastrar cliente"}</button>
              {editingId ? <button className="secondary-button" type="button" onClick={cancelEdit}>Cancelar</button> : null}
            </div>
          </form>

          <section className="catalog-results">
            <div className="catalog-filters"><strong>{filtered.length} clientes</strong></div>
            <div className="preset-grid">
              {filtered.map((customer) => {
                const totalSpent = customer.orders.reduce((sum, order) => sum + order.paidAmount, 0);
                const totalOwed = customer.orders.reduce((sum, order) => sum + Math.max(order.totalAmount - order.paidAmount, 0), 0);
                return (
                  <article className="preset-card" key={customer.id}>
                    <div className="card-top">
                      <span className="material-badge">{customer.orders.length} pedido(s)</span>
                      <span className="card-actions">
                        <button className="edit-button" onClick={() => edit(customer)}>Editar</button>
                        <button className="delete-button" onClick={() => archive(customer.id)} aria-label={`Excluir ${customer.name}`}>♧</button>
                      </span>
                    </div>
                    <h3>{customer.name}</h3>
                    <p>{customer.email || "sem e-mail"} {customer.phone ? `· ${customer.phone}` : ""}</p>
                    <p className="card-detail">
                      Total pago: {brl(totalSpent)}
                      {totalOwed > 0 ? ` · A receber: ${brl(totalOwed)}` : ""}
                    </p>
                    {customer.notes ? <p className="card-detail">{customer.notes}</p> : null}
                  </article>
                );
              })}
              {filtered.length === 0 ? <div className="empty-note">Nenhum cliente cadastrado ainda.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
