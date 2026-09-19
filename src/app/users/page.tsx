"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { ROLE_OPTIONS, roleLabel, type Role } from "@/lib/roles";

type ManagedUser = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string };

type Draft = { name: string; email: string; password: string; role: Role; active: boolean };

const emptyDraft: Draft = { name: "", email: "", password: "", role: "CALCULATOR", active: true };

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackOk, setFeedbackOk] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    async function load() {
      const [usersRes, sessionRes] = await Promise.all([fetch("/api/users"), fetch("/api/session")]);
      if (usersRes.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (usersRes.status === 403) { setForbidden(true); return; }
      setForbidden(false);
      if (usersRes.ok) setUsers((await usersRes.json()) as ManagedUser[]);
      if (sessionRes.ok) setCurrentUserId(((await sessionRes.json()) as { id?: string }).id ?? null);
    }
    void load();
  }, [reloadToken]);

  const filtered = useMemo(
    () => users.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase())),
    [users, search],
  );
  // Editar o próprio perfil de acesso é bloqueado no servidor (pra não se
  // trancar fora sem querer) — desabilitar aqui mostra isso antes de tentar
  // salvar, em vez de deixar a pessoa digitar tudo e só descobrir no erro.
  const isEditingSelf = editingId !== null && editingId === currentUserId;

  async function save(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload: Record<string, unknown> = { name: draft.name, email: draft.email, role: draft.role, active: draft.active };
    if (draft.password) payload.password = draft.password;
    if (!editingId) payload.password = draft.password;

    const response = await fetch(editingId ? `/api/users?id=${encodeURIComponent(editingId)}` : "/api/users", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) { setFeedbackOk(false); setFeedback(typeof body.error === "string" ? body.error : "Não foi possível salvar o usuário. Confira os campos."); return; }
    setFeedbackOk(true);
    setFeedback(editingId ? "Usuário atualizado." : "Usuário criado.");
    setDraft(emptyDraft);
    setEditingId(null);
    reload();
  }

  function edit(user: ManagedUser) {
    setEditingId(user.id);
    setDraft({ name: user.name, email: user.email, password: "", role: user.role, active: user.active });
    setFeedback("");
    document.getElementById("user-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
    setFeedback("");
  }

  async function remove(user: ManagedUser) {
    if (!window.confirm(`Desativar o acesso de ${user.name}? O histórico (produtos, orçamentos, pedidos) criado por ele é preservado.`)) return;
    const response = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) { setFeedbackOk(false); setFeedback(typeof body.error === "string" ? body.error : "Não foi possível desativar."); return; }
    setFeedbackOk(true);
    setFeedback(`${user.name} desativado.`);
    if (editingId === user.id) cancelEdit();
    reload();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="users" badges={{ users: users.length }} />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para gerenciar usuários." /> : null}
        {forbidden ? <p className="admin-feedback feedback-error">Seu perfil de acesso atual não é Administrador, então esta área fica indisponível. Peça a um administrador pra ajustar seu perfil.</p> : null}

        <section className="library-heading">
          <div>
            <h1>Usuários</h1>
            <p>Quem tem acesso ao sistema, e a quais áreas — Administrador (tudo), Gerador de Catálogo (só Catálogo) ou Gerador de Calculadora (só Calculadora).</p>
          </div>
          <div className="project-tools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail..." />
            <a className="new-quote-button" href="#user-form">＋ Novo usuário</a>
          </div>
        </section>

        {feedback ? <p className={feedbackOk ? "admin-feedback feedback-ok" : "admin-feedback feedback-error"}>{feedback}</p> : null}

        {!forbidden ? (
          <div className="library-layout">
            <form id="user-form" className="preset-form" onSubmit={save}>
              <h2>{editingId ? "Editar usuário" : "Novo usuário"}</h2>
              <label>Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome completo" /></label>
              <label>E-mail<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="usuario@email.com" /></label>
              <label>
                Senha{editingId ? <small> — deixe em branco para manter a atual</small> : null}
                <input required={!editingId} type="password" minLength={6} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={editingId ? "Nova senha (opcional)" : "Mínimo 6 caracteres"} />
              </label>
              <label>
                Perfil de acesso
                <select disabled={isEditingSelf} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                  {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <small>{isEditingSelf ? "Você não pode mudar seu próprio perfil ou se desativar — peça a outro administrador." : ROLE_OPTIONS.find((item) => item.value === draft.role)?.description}</small>
              </label>
              <label className="checkbox-field">
                <input type="checkbox" disabled={isEditingSelf} checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
                Usuário ativo (desmarcar bloqueia o login sem excluir)
              </label>
              <div className="form-actions">
                <button className="primary-button" type="submit">{editingId ? "Salvar alterações" : "Criar usuário"}</button>
                {editingId ? <button className="secondary-button" type="button" onClick={cancelEdit}>Cancelar</button> : null}
              </div>
            </form>

            <section className="catalog-results">
              <div className="catalog-filters"><strong>{filtered.length} usuários</strong></div>
              <div className="preset-grid">
                {filtered.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <article className="preset-card" key={user.id}>
                      <div className="card-top">
                        <span className="material-badge">{roleLabel(user.role)}</span>
                        <span className="card-actions">
                          <button className="edit-button" onClick={() => edit(user)}>Editar</button>
                          {!isSelf ? <button className="delete-button" onClick={() => remove(user)} aria-label={`Desativar ${user.name}`}><IconTrash className="nav-icon" /></button> : null}
                        </span>
                      </div>
                      <h3>{user.name}{isSelf ? " (você)" : ""}</h3>
                      <p>{user.email}</p>
                      <p className="card-detail">{user.active ? "Ativo" : "Desativado"} · desde {new Date(user.createdAt).toLocaleDateString("pt-BR")}</p>
                    </article>
                  );
                })}
                {filtered.length === 0 ? <div className="empty-note">Nenhum usuário encontrado.</div> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
