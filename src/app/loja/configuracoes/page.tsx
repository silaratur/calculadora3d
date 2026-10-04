"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";

/**
 * Loja → Configurações da loja: tudo que a loja online usa e antes ficava
 * misturado nas Configurações gerais (prazo, desconto por quantidade, frete,
 * cupom, depoimentos e a conexão do Instagram da Divulgação). Grava nos mesmos
 * campos de PricingSettings: carrega o registro inteiro e devolve inteiro.
 */
type Settings = Record<string, unknown> & {
  storeProductionDays: number;
  storeQtyDiscounts: string;
  storeFreeShippingMin: number;
  storeShippingText: string;
  storeCouponCode: string;
  storeCouponPercent: number;
  quoteDeliveryText: string;
  quotePaymentText: string;
  quoteWarrantyText: string;
};
type Testimonial = { id: string; name: string; text: string; context: string };
type Tier = { minQty: string; percent: string };
type InstagramStatus = { connected: false } | { connected: true; username: string; igUserId: string; tokenHint: string; tokenExpiresAt: string | null; lastCheckedAt: string | null };

const emptyTestimonial = { name: "", text: "", context: "" };
const numberValue = (value: string) => { const clean = value.replace(/R\$\s?/g, "").replace(/\s/g, ""); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean) || 0; };

/** storeQtyDiscounts vem do banco como JSON; na tela vira linhas editáveis. */
function parseTiers(raw: string): Tier[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((tier: { minQty?: number; percent?: number }) => ({ minQty: String(tier.minQty ?? ""), percent: String(tier.percent ?? "") }));
  } catch {
    return [];
  }
}

export default function StoreSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonial, setTestimonial] = useState(emptyTestimonial);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [instagram, setInstagram] = useState<InstagramStatus | null>(null);
  const [instagramToken, setInstagramToken] = useState("");
  const [instagramFeedback, setInstagramFeedback] = useState("");
  const [instagramBusy, setInstagramBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsResponse, testimonialsResponse, instagramResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/testimonials"), fetch("/api/instagram")]);
      if (settingsResponse.status === 401) { setNeedsLogin(true); return; }
      if (settingsResponse.ok) {
        const loaded = (await settingsResponse.json()) as Settings;
        setSettings(loaded);
        setTiers(parseTiers(loaded.storeQtyDiscounts));
      }
      if (testimonialsResponse.ok) setTestimonials((await testimonialsResponse.json()) as Testimonial[]);
      if (instagramResponse.ok) setInstagram((await instagramResponse.json()) as InstagramStatus);
    }
    void load();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    // Linhas vazias/incompletas são ignoradas em vez de bloquear o salvamento.
    const storeQtyDiscounts = tiers
      .map((tier) => ({ minQty: Math.round(numberValue(tier.minQty)), percent: numberValue(tier.percent) }))
      .filter((tier) => tier.minQty >= 2 && tier.percent > 0);
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, storeQtyDiscounts }) });
    setFeedback(response.ok ? "Configurações da loja salvas." : "Não foi possível salvar. Confira os campos.");
  }

  // PUT salva um token novo (validado no Instagram antes de gravar), POST só
  // testa o salvo e DELETE desconecta. A resposta nunca traz o token.
  async function instagramRequest(method: "PUT" | "POST" | "DELETE", success: string) {
    setInstagramBusy(true);
    setInstagramFeedback("");
    const response = await fetch("/api/instagram", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ token: instagramToken }) : undefined,
    });
    const body = (await response.json().catch(() => null)) as (InstagramStatus & { error?: string }) | null;
    setInstagramBusy(false);
    if (!response.ok) { setInstagramFeedback(body?.error ?? "Não foi possível falar com o Instagram."); return; }
    if (body) setInstagram(body);
    setInstagramToken("");
    setInstagramFeedback(success);
  }

  async function saveTestimonial(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/testimonials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testimonial) });
    if (!response.ok) { setFeedback("Confira o nome e o texto do depoimento."); return; }
    setTestimonials([(await response.json()) as Testimonial, ...testimonials]);
    setTestimonial(emptyTestimonial);
    setFeedback("Depoimento publicado na loja.");
  }

  async function deleteTestimonial(id: string) {
    const response = await fetch(`/api/testimonials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setTestimonials(testimonials.filter((item) => item.id !== id));
  }

  const set = (patch: Partial<Settings>) => setSettings((current) => (current ? { ...current, ...patch } : current));

  return (
    <main className="admin-shell">
      <AdminHeader active="loja-config" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e salvar as configurações da loja." /> : null}

        <section className="library-heading">
          <div>
            <h1>Configurações da loja</h1>
            <p>Prazo, descontos, entrega, cupom, depoimentos e a conta do Instagram usada na Divulgação.</p>
          </div>
        </section>

        <div className="settings-layout">
          {settings ? (
            <form className="preset-form" onSubmit={saveSettings}>
              <h2>Vendas na loja (ac3d.silaratur.cloud)</h2>
              <div className="settings-group">
                <h3>Prazo</h3>
                <p className="settings-intro">O prazo em dias úteis calcula a data-limite das vitrines de datas comemorativas (ex.: &quot;Peça até 28/09 para o Dia das Crianças&quot;).</p>
                <label>Prazo de produção (dias úteis)<input inputMode="numeric" value={settings.storeProductionDays} onChange={(event) => set({ storeProductionDays: Math.round(numberValue(event.target.value)) })} /></label>
              </div>
              <div className="settings-group">
                <h3>Desconto por quantidade</h3>
                <p className="settings-intro">Vale por produto, somando as cores.</p>
                {tiers.map((tier, index) => (
                  <div className="store-inline" key={index}>
                    <label>A partir de (un.)<input inputMode="numeric" value={tier.minQty} onChange={(event) => setTiers(tiers.map((item, i) => (i === index ? { ...item, minQty: event.target.value } : item)))} placeholder="10" /></label>
                    <label>Desconto (%)<input inputMode="decimal" value={tier.percent} onChange={(event) => setTiers(tiers.map((item, i) => (i === index ? { ...item, percent: event.target.value } : item)))} placeholder="10" /></label>
                    <button type="button" className="quiet-button" onClick={() => setTiers(tiers.filter((_, i) => i !== index))} aria-label={`Remover faixa ${index + 1}`}><IconTrash className="nav-icon" /> Remover</button>
                  </div>
                ))}
                {tiers.length < 5 ? <button type="button" className="quiet-button store-inline-add" onClick={() => setTiers([...tiers, { minQty: "", percent: "" }])}>+ Adicionar faixa</button> : null}
              </div>
              <div className="settings-group">
                <h3>Entrega</h3>
                <label>Frete grátis a partir de (R$, 0 = não oferecer)<input inputMode="decimal" value={settings.storeFreeShippingMin} onChange={(event) => set({ storeFreeShippingMin: numberValue(event.target.value) })} /></label>
                <label>Texto de entrega na loja<input type="text" value={settings.storeShippingText} onChange={(event) => set({ storeShippingText: event.target.value })} placeholder="Ex: Retirada grátis em Vitória ou envio pelos Correios." /></label>
              </div>
              <div className="settings-group">
                <h3>Cupom de primeira compra</h3>
                <p className="settings-intro">Divulgue no Instagram. A loja só avisa que existe cupom; o código é conferido na sacola.</p>
                <div className="store-inline">
                  <label>Código<input type="text" value={settings.storeCouponCode} onChange={(event) => set({ storeCouponCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="BEMVINDO10" /></label>
                  <label>Desconto (%)<input inputMode="decimal" value={settings.storeCouponPercent} onChange={(event) => set({ storeCouponPercent: numberValue(event.target.value) })} /></label>
                </div>
              </div>
              <p className="settings-intro">Pagamento, garantia e prazo de entrega que aparecem na loja são os mesmos textos do orçamento em PDF, em <a href="/settings">Configurações</a>.</p>
              <button className="primary-button" type="submit">Salvar configurações da loja</button>
            </form>
          ) : <p className="library-loading">Carregando...</p>}

          <div className="settings-side">
            {instagram ? (
              <form className="preset-form" onSubmit={(event) => { event.preventDefault(); void instagramRequest("PUT", "Token salvo e conexão confirmada."); }}>
                <h2>Instagram</h2>
                <p className="settings-intro">Conexão do app &quot;AC3D Publicador&quot; para publicar os posts aprovados na Divulgação. O token fica guardado cifrado e não aparece de novo nesta tela.</p>
                {instagram.connected ? (
                  <div className="instagram-status">
                    <strong>Conectado como @{instagram.username}</strong>
                    <span>Token terminado em …{instagram.tokenHint}{instagram.tokenExpiresAt ? ` · vale até ${new Date(instagram.tokenExpiresAt).toLocaleDateString("pt-BR")}` : ""}</span>
                    {instagram.lastCheckedAt ? <span>Última verificação: {new Date(instagram.lastCheckedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span> : null}
                  </div>
                ) : <p className="instagram-status">Nenhuma conta conectada.</p>}
                <label>{instagram.connected ? "Trocar token" : "Token de acesso"}<input type="password" autoComplete="off" spellCheck={false} value={instagramToken} onChange={(event) => setInstagramToken(event.target.value)} placeholder="Cole aqui o token gerado no painel da Meta" /></label>
                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={instagramBusy || instagramToken.trim().length < 20}>{instagramBusy ? "Verificando..." : "Salvar token"}</button>
                  {instagram.connected ? <button className="secondary-button" type="button" disabled={instagramBusy} onClick={() => void instagramRequest("POST", "Conexão funcionando.")}>Testar conexão</button> : null}
                  {instagram.connected ? <button className="quiet-button" type="button" disabled={instagramBusy} onClick={() => { if (window.confirm("Desconectar o Instagram? O token salvo será apagado.")) void instagramRequest("DELETE", "Instagram desconectado."); }}>Desconectar</button> : null}
                </div>
                {instagramFeedback ? <p className="settings-intro">{instagramFeedback}</p> : null}
              </form>
            ) : null}

            <form className="preset-form" onSubmit={saveTestimonial}>
              <h2>Depoimentos</h2>
              <p className="settings-intro">O que clientes disseram (peça pelo WhatsApp depois da entrega). Aparecem na loja; só publique com autorização do cliente.</p>
              <label>Nome<input required value={testimonial.name} onChange={(event) => setTestimonial({ ...testimonial, name: event.target.value })} placeholder="Ex: Mariana, Vitória" /></label>
              <label>Depoimento<textarea required value={testimonial.text} onChange={(event) => setTestimonial({ ...testimonial, text: event.target.value })} /></label>
              <label>Sobre o quê (opcional)<input value={testimonial.context} onChange={(event) => setTestimonial({ ...testimonial, context: event.target.value })} placeholder="Ex: Mini pandas para a festa de 5 anos" /></label>
              <button className="primary-button" type="submit">Publicar depoimento</button>
              {testimonials.map((item) => (
                <article className="preset-card" key={item.id}>
                  <div className="card-top">
                    <span className="material-badge">DEPOIMENTO</span>
                    <button type="button" className="delete-button" onClick={() => deleteTestimonial(item.id)} aria-label={`Excluir depoimento de ${item.name}`}><IconTrash className="nav-icon" /></button>
                  </div>
                  <h3>{item.name}</h3>
                  <p>{item.text}</p>
                  {item.context ? <p>{item.context}</p> : null}
                </article>
              ))}
            </form>
          </div>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </div>
    </main>
  );
}
