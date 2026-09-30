"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";
import { brl } from "@/lib/money";

type Settings = { energyRate: number; defaultPowerWatts: number; laborRate: number; monthlyRent: number; monthlySubscriptions: number; monthlyMaintenance: number; monthlyOtherCosts: number; monthlyPieces: number; defaultMarkup: number; defaultLossRate: number; companyName: string; companyContact: string; quoteValidityDays: number; quoteDeliveryText: string; quoteWarrantyText: string; quotePaymentText: string; storeProductionDays: number; storeQtyDiscounts: string; roundPricesTo90: boolean; storeFreeShippingMin: number; storeShippingText: string; storeCouponCode: string; storeCouponPercent: number };
type Testimonial = { id: string; name: string; text: string; context: string };
type Tier = { minQty: string; percent: string };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number; notes: string };

const emptySettings: Settings = { energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60, defaultMarkup: 40, defaultLossRate: 5, companyName: "AC3D", companyContact: "", quoteValidityDays: 7, quoteDeliveryText: "", quoteWarrantyText: "", quotePaymentText: "", storeProductionDays: 10, storeQtyDiscounts: "[]", roundPricesTo90: true, storeFreeShippingMin: 0, storeShippingText: "", storeCouponCode: "", storeCouponPercent: 0 };
const emptyTestimonial = { name: "", text: "", context: "" };

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
const emptyChannel = { name: "", commissionRate: "0", fixedFee: "0", adsRate: "0", notes: "" };
const numberValue = (value: string) => { const clean = value.replace(/R\$\s?/g, "").replace(/\s/g, ""); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean) || 0; };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonial, setTestimonial] = useState(emptyTestimonial);
  const [channel, setChannel] = useState(emptyChannel);
  const [channels, setChannels] = useState<Marketplace[]>([]);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsResponse, channelsResponse, testimonialsResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/marketplaces"), fetch("/api/testimonials")]);
      if (testimonialsResponse.ok) setTestimonials((await testimonialsResponse.json()) as Testimonial[]);
      if (settingsResponse.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (settingsResponse.ok) {
        const loaded = (await settingsResponse.json()) as Settings;
        setSettings(loaded);
        setTiers(parseTiers(loaded.storeQtyDiscounts));
      }
      if (channelsResponse.ok) setChannels((await channelsResponse.json()) as Marketplace[]);
    }
    void load();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    // Linhas vazias/incompletas são ignoradas em vez de bloquear o salvamento.
    const storeQtyDiscounts = tiers
      .map((tier) => ({ minQty: Math.round(numberValue(tier.minQty)), percent: numberValue(tier.percent) }))
      .filter((tier) => tier.minQty >= 2 && tier.percent > 0);
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, storeQtyDiscounts }) });
    setFeedback(response.ok ? "Configurações salvas." : "Não foi possível salvar as configurações.");
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

  async function saveChannel(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...channel,
      commissionRate: numberValue(channel.commissionRate) / 100,
      fixedFee: numberValue(channel.fixedFee),
      adsRate: numberValue(channel.adsRate) / 100,
      active: true,
    };
    const response = await fetch(editingChannelId ? `/api/marketplaces?id=${encodeURIComponent(editingChannelId)}` : "/api/marketplaces", {
      method: editingChannelId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { setFeedback("Confira os dados do canal."); return; }
    const saved = (await response.json()) as Marketplace;
    setChannels(editingChannelId ? channels.map((item) => (item.id === editingChannelId ? saved : item)) : [...channels, saved]);
    setChannel(emptyChannel);
    setEditingChannelId(null);
    setFeedback(editingChannelId ? "Canal atualizado." : "Canal salvo.");
  }

  function editChannel(item: Marketplace) {
    setEditingChannelId(item.id);
    setChannel({
      name: item.name,
      commissionRate: String(item.commissionRate * 100),
      fixedFee: String(item.fixedFee),
      adsRate: String(item.adsRate * 100),
      notes: item.notes,
    });
    setFeedback("");
    document.getElementById("channel-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditChannel() {
    setEditingChannelId(null);
    setChannel(emptyChannel);
    setFeedback("");
  }

  async function deleteChannel(id: string) {
    await fetch(`/api/marketplaces?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setChannels(channels.filter((item) => item.id !== id));
    if (editingChannelId === id) cancelEditChannel();
  }

  return (
    <main className="admin-shell">
      <AdminHeader active="settings" />
      <div className="admin-content">
        {needsLogin ? <AuthBanner message="Entre novamente para ver e salvar as configurações." /> : null}

        <section className="library-heading">
          <div>
            <h1>Configurações de Precificação</h1>
            <p>Regras gerais da operação e canais de venda usados nos cálculos.</p>
          </div>
        </section>

        <div className="settings-layout">
          <form className="preset-form" onSubmit={saveSettings}>
            <h2>Parâmetros da operação</h2>
            <p className="settings-intro">Esses valores alimentam automaticamente a calculadora e o custo fixo rateado por peça. Custo de produção da máquina (kWh, potência, hora de trabalho, peças produzidas por mês) e custos fixos mensais detalhados agora ficam em Custos → Produção e Custos → Fixos.</p>
            <div className="settings-group">
              <h3>Preço padrão</h3>
              <label className="checkbox-field">
                <input type="checkbox" checked={settings.roundPricesTo90} onChange={(event) => setSettings({ ...settings, roundPricesTo90: event.target.checked })} />
                Arredondar o preço de venda do Catálogo para terminar em ,90
              </label>
              <label>Markup padrão (%)<input value={settings.defaultMarkup} onChange={(event) => setSettings({ ...settings, defaultMarkup: numberValue(event.target.value) })} /></label>
              <label>Perdas/refugo padrão (%)<input value={settings.defaultLossRate} onChange={(event) => setSettings({ ...settings, defaultLossRate: numberValue(event.target.value) })} /></label>
            </div>
            <div className="settings-group">
              <h3>Orçamento em PDF (o que o cliente vê)</h3>
              <label>Nome da empresa<input type="text" value={settings.companyName} onChange={(event) => setSettings({ ...settings, companyName: event.target.value })} placeholder="AC3D" /></label>
              <label>Contato (telefone, e-mail, @)<input type="text" value={settings.companyContact} onChange={(event) => setSettings({ ...settings, companyContact: event.target.value })} placeholder="WhatsApp (00) 00000-0000 · contato@ac3d.com.br" /></label>
              <label>Validade do orçamento (dias)<input inputMode="numeric" value={settings.quoteValidityDays} onChange={(event) => setSettings({ ...settings, quoteValidityDays: numberValue(event.target.value) })} /></label>
              <label>Prazo de produção/entrega<textarea value={settings.quoteDeliveryText} onChange={(event) => setSettings({ ...settings, quoteDeliveryText: event.target.value })} placeholder="Ex: 5 a 10 dias úteis após a confirmação do pagamento." /></label>
              <label>Forma de pagamento<textarea value={settings.quotePaymentText} onChange={(event) => setSettings({ ...settings, quotePaymentText: event.target.value })} placeholder="Ex: 50% de sinal para iniciar a produção e 50% na entrega." /></label>
              <label>Garantia do produto<textarea value={settings.quoteWarrantyText} onChange={(event) => setSettings({ ...settings, quoteWarrantyText: event.target.value })} placeholder="Ex: 30 dias contra defeitos de fabricação a partir da entrega." /></label>
            </div>
            <div className="settings-group">
              <h3>Loja online (ac3d.silaratur.cloud)</h3>
              <p className="settings-intro">Prazo, pagamento e garantia acima também aparecem na loja. O prazo em dias úteis calcula a data-limite das vitrines sazonais (ex: &quot;Peça até 28/09 para o Dia das Crianças&quot;).</p>
              <label>Prazo de produção (dias úteis)<input inputMode="numeric" value={settings.storeProductionDays} onChange={(event) => setSettings({ ...settings, storeProductionDays: Math.round(numberValue(event.target.value)) })} /></label>
              <span className="settings-subtitle">Desconto por quantidade (vale por produto, somando as cores)</span>
              {tiers.map((tier, index) => (
                <div className="form-grid three" key={index}>
                  <label>A partir de (un.)<input inputMode="numeric" value={tier.minQty} onChange={(event) => setTiers(tiers.map((item, i) => (i === index ? { ...item, minQty: event.target.value } : item)))} placeholder="10" /></label>
                  <label>Desconto (%)<input inputMode="decimal" value={tier.percent} onChange={(event) => setTiers(tiers.map((item, i) => (i === index ? { ...item, percent: event.target.value } : item)))} placeholder="10" /></label>
                  <button type="button" className="quiet-button" onClick={() => setTiers(tiers.filter((_, i) => i !== index))} aria-label={`Remover faixa ${index + 1}`}><IconTrash className="nav-icon" /> Remover</button>
                </div>
              ))}
              {tiers.length < 5 ? <button type="button" className="quiet-button" onClick={() => setTiers([...tiers, { minQty: "", percent: "" }])}>+ Adicionar faixa</button> : null}
              <span className="settings-subtitle">Entrega</span>
              <label>Frete grátis a partir de (R$, 0 = não oferecer)<input inputMode="decimal" value={settings.storeFreeShippingMin} onChange={(event) => setSettings({ ...settings, storeFreeShippingMin: numberValue(event.target.value) })} /></label>
              <label>Texto de entrega na loja<input type="text" value={settings.storeShippingText} onChange={(event) => setSettings({ ...settings, storeShippingText: event.target.value })} placeholder="Ex: Retirada grátis em Vitória ou envio pelos Correios." /></label>
              <span className="settings-subtitle">Cupom de primeira compra (divulgue no Instagram)</span>
              <div className="form-grid three">
                <label>Código<input type="text" value={settings.storeCouponCode} onChange={(event) => setSettings({ ...settings, storeCouponCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="BEMVINDO10" /></label>
                <label>Desconto (%)<input inputMode="decimal" value={settings.storeCouponPercent} onChange={(event) => setSettings({ ...settings, storeCouponPercent: numberValue(event.target.value) })} /></label>
              </div>
            </div>
            <button className="primary-button" type="submit">Salvar configurações</button>
          </form>

          <div className="settings-side">
            <form id="channel-form" className="preset-form" onSubmit={saveChannel}>
              <h2>{editingChannelId ? "Editar canal de venda" : "Novo canal de venda"}</h2>
              <label>Nome do canal<input required value={channel.name} onChange={(event) => setChannel({ ...channel, name: event.target.value })} placeholder="Ex: Shopee" /></label>
              <div className="form-grid three">
                <label>Comissão (%)<input inputMode="decimal" value={channel.commissionRate} onChange={(event) => setChannel({ ...channel, commissionRate: event.target.value })} /></label>
                <label>Ads / anúncios (%)<input inputMode="decimal" value={channel.adsRate} onChange={(event) => setChannel({ ...channel, adsRate: event.target.value })} /></label>
                <label>Taxa fixa (R$)<input inputMode="decimal" value={channel.fixedFee} onChange={(event) => setChannel({ ...channel, fixedFee: event.target.value })} /></label>
              </div>
              <label>Observações<textarea value={channel.notes} onChange={(event) => setChannel({ ...channel, notes: event.target.value })} /></label>
              <div className="form-actions">
                <button className="primary-button" type="submit">{editingChannelId ? "Salvar alterações" : "Adicionar canal"}</button>
                {editingChannelId ? <button className="secondary-button" type="button" onClick={cancelEditChannel}>Cancelar</button> : null}
              </div>
            </form>

            <form className="preset-form" onSubmit={saveTestimonial}>
              <h2>Depoimentos da loja</h2>
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

            <div className="channel-list">
              {channels.map((item) => (
                <article className="preset-card" key={item.id}>
                  <div className="card-top">
                    <span className="material-badge">CANAL</span>
                    <span className="card-actions">
                      <button className="edit-button" onClick={() => editChannel(item)}>Editar</button>
                      <button className="delete-button" onClick={() => deleteChannel(item.id)} aria-label={`Excluir ${item.name}`}><IconTrash className="nav-icon" /></button>
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <p>Comissão: {(item.commissionRate * 100).toFixed(1)}% · Ads: {(item.adsRate * 100).toFixed(1)}%</p>
                  <strong>{brl(item.fixedFee)} taxa fixa</strong>
                </article>
              ))}
            </div>
          </div>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </div>
    </main>
  );
}
