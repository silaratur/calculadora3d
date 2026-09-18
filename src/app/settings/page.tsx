"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { IconTrash } from "@/components/Icons";

type Settings = { energyRate: number; defaultPowerWatts: number; laborRate: number; monthlyRent: number; monthlySubscriptions: number; monthlyMaintenance: number; monthlyOtherCosts: number; monthlyPieces: number; defaultMarkup: number; defaultLossRate: number; companyName: string; companyContact: string; quoteValidityDays: number; quoteDeliveryText: string; quoteWarrantyText: string; quotePaymentText: string };
type Marketplace = { id: string; name: string; commissionRate: number; fixedFee: number; adsRate: number; notes: string };

const emptySettings: Settings = { energyRate: 0.85, defaultPowerWatts: 250, laborRate: 25, monthlyRent: 0, monthlySubscriptions: 50, monthlyMaintenance: 40, monthlyOtherCosts: 0, monthlyPieces: 60, defaultMarkup: 40, defaultLossRate: 5, companyName: "AC3D", companyContact: "", quoteValidityDays: 7, quoteDeliveryText: "", quoteWarrantyText: "", quotePaymentText: "" };
const emptyChannel = { name: "", commissionRate: "0", fixedFee: "0", adsRate: "0", notes: "" };
const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const numberValue = (value: string) => { const clean = value.replace(/R\$\s?/g, "").replace(/\s/g, ""); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean) || 0; };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [channel, setChannel] = useState(emptyChannel);
  const [channels, setChannels] = useState<Marketplace[]>([]);
  const [feedback, setFeedback] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsResponse, channelsResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/marketplaces")]);
      if (settingsResponse.status === 401) { setNeedsLogin(true); return; }
      setNeedsLogin(false);
      if (settingsResponse.ok) setSettings((await settingsResponse.json()) as Settings);
      if (channelsResponse.ok) setChannels((await channelsResponse.json()) as Marketplace[]);
    }
    void load();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setFeedback(response.ok ? "Configurações salvas." : "Não foi possível salvar as configurações.");
  }

  async function saveChannel(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/marketplaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...channel, commissionRate: numberValue(channel.commissionRate) / 100, fixedFee: numberValue(channel.fixedFee), adsRate: numberValue(channel.adsRate) / 100, active: true }) });
    if (!response.ok) { setFeedback("Confira os dados do canal."); return; }
    setChannels([...channels, await response.json()]);
    setChannel(emptyChannel);
    setFeedback("Canal salvo.");
  }

  async function deleteChannel(id: string) {
    await fetch(`/api/marketplaces?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setChannels(channels.filter((item) => item.id !== id));
  }

  return <main className="admin-shell"><AdminHeader active="settings" /><div className="admin-content">{needsLogin ? <AuthBanner message="Entre novamente para ver e salvar as configurações." /> : null}<section className="library-heading"><div><h1>Configurações de Precificação</h1><p>Regras gerais da operação e canais de venda usados nos cálculos.</p></div></section><div className="settings-layout"><form className="preset-form" onSubmit={saveSettings}><h2>Parâmetros da operação</h2><p className="settings-intro">Esses valores alimentam automaticamente a calculadora e o custo fixo rateado por peça. Custo de produção da máquina (kWh, potência, hora de trabalho, peças produzidas por mês) e custos fixos mensais detalhados agora ficam em Custos → Produção e Custos → Fixos.</p><div className="settings-group"><h3>Preço padrão</h3><label>Markup padrão (%)<input value={settings.defaultMarkup} onChange={(event) => setSettings({ ...settings, defaultMarkup: numberValue(event.target.value) })} /></label><label>Perdas/refugo padrão (%)<input value={settings.defaultLossRate} onChange={(event) => setSettings({ ...settings, defaultLossRate: numberValue(event.target.value) })} /></label></div><div className="settings-group"><h3>Orçamento em PDF (o que o cliente vê)</h3><label>Nome da empresa<input type="text" value={settings.companyName} onChange={(event) => setSettings({ ...settings, companyName: event.target.value })} placeholder="AC3D" /></label><label>Contato (telefone, e-mail, @)<input type="text" value={settings.companyContact} onChange={(event) => setSettings({ ...settings, companyContact: event.target.value })} placeholder="WhatsApp (00) 00000-0000 · contato@ac3d.com.br" /></label><label>Validade do orçamento (dias)<input inputMode="numeric" value={settings.quoteValidityDays} onChange={(event) => setSettings({ ...settings, quoteValidityDays: numberValue(event.target.value) })} /></label><label>Prazo de produção/entrega<textarea value={settings.quoteDeliveryText} onChange={(event) => setSettings({ ...settings, quoteDeliveryText: event.target.value })} placeholder="Ex: 5 a 10 dias úteis após a confirmação do pagamento." /></label><label>Forma de pagamento<textarea value={settings.quotePaymentText} onChange={(event) => setSettings({ ...settings, quotePaymentText: event.target.value })} placeholder="Ex: 50% de sinal para iniciar a produção e 50% na entrega." /></label><label>Garantia do produto<textarea value={settings.quoteWarrantyText} onChange={(event) => setSettings({ ...settings, quoteWarrantyText: event.target.value })} placeholder="Ex: 30 dias contra defeitos de fabricação a partir da entrega." /></label></div><button className="primary-button" type="submit">Salvar configurações</button></form><div className="settings-side"><form className="preset-form" onSubmit={saveChannel}><h2>Novo canal de venda</h2><label>Nome do canal<input required value={channel.name} onChange={(event) => setChannel({ ...channel, name: event.target.value })} placeholder="Ex: Shopee" /></label><div className="form-grid"><label>Comissão (%)<input inputMode="decimal" value={channel.commissionRate} onChange={(event) => setChannel({ ...channel, commissionRate: event.target.value })} /></label><label>Taxa fixa (R$)<input inputMode="decimal" value={channel.fixedFee} onChange={(event) => setChannel({ ...channel, fixedFee: event.target.value })} /></label></div><label>Ads / anúncios (%)<input inputMode="decimal" value={channel.adsRate} onChange={(event) => setChannel({ ...channel, adsRate: event.target.value })} /></label><label>Observações<textarea value={channel.notes} onChange={(event) => setChannel({ ...channel, notes: event.target.value })} /></label><button className="primary-button" type="submit">Adicionar canal</button></form><div className="channel-list">{channels.map((item) => <article className="preset-card" key={item.id}><div className="card-top"><span className="material-badge">CANAL</span><button className="delete-button" onClick={() => deleteChannel(item.id)}><IconTrash className="nav-icon" /></button></div><h3>{item.name}</h3><p>Comissão: {(item.commissionRate * 100).toFixed(1)}% · Ads: {(item.adsRate * 100).toFixed(1)}%</p><strong>{money(item.fixedFee)} taxa fixa</strong></article>)}</div></div></div>{feedback ? <p className="admin-feedback">{feedback}</p> : null}</div></main>;
}
