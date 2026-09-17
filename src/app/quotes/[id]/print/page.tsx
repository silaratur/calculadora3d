"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthBanner } from "@/components/AuthBanner";
import { IconDownload } from "@/components/Icons";

type QuoteRecord = {
  id: string;
  code: string | null;
  productName: string;
  customerName: string;
  finalPrice: number;
  notes: string;
  snapshotJson: string;
  validUntil: string | null;
  createdAt: string;
};

type Snapshot = {
  material?: { name?: string; type?: string } | null;
  weightGrams?: number;
  supplies?: { id: string; name: string; quantity: number }[];
  customExtras?: { id: string; name: string }[];
  calculations?: { printTime?: number };
};

type Settings = {
  companyName: string;
  companyContact: string;
  quoteDeliveryText: string;
  quoteWarrantyText: string;
  quotePaymentText: string;
};

const emptySettings: Settings = {
  companyName: "AC3D",
  companyContact: "",
  quoteDeliveryText: "",
  quoteWarrantyText: "",
  quotePaymentText: "",
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLong = (value: string | Date) => new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const printTimeLabel = (hours: number) => `${Math.floor(hours)}h${hours % 1 ? ` ${Math.round((hours % 1) * 60)}min` : ""}`;

function parseSnapshot(json: string): Snapshot {
  try {
    return JSON.parse(json) as Snapshot;
  } catch {
    return {};
  }
}

export default function QuotePrintPage() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [quoteRes, settingsRes] = await Promise.all([fetch(`/api/quotes/${params.id}`), fetch("/api/settings")]);
      if (quoteRes.status === 401 || settingsRes.status === 401) { setNeedsLogin(true); setLoading(false); return; }
      if (quoteRes.status === 404) { setNotFound(true); setLoading(false); return; }
      if (quoteRes.ok) setQuote((await quoteRes.json()) as QuoteRecord);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as Settings);
      setLoading(false);
    }
    void load();
  }, [params.id]);

  if (loading) return <main className="admin-shell quote-print-page" />;
  if (needsLogin) return <main className="admin-shell quote-print-page"><AuthBanner message="Entre novamente para ver este orçamento." /></main>;
  if (notFound || !quote) return <main className="admin-shell quote-print-page"><div className="quote-doc-empty">Orçamento não encontrado.</div></main>;

  const snapshot = parseSnapshot(quote.snapshotJson);
  const includedItems = [
    ...(snapshot.supplies ?? []).filter((item) => item.name).map((item) => (item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name)),
    ...(snapshot.customExtras ?? []).filter((item) => item.name).map((item) => item.name),
  ];
  const specs = [
    snapshot.material?.name,
    snapshot.weightGrams ? `Peso estimado: ${snapshot.weightGrams}g` : null,
    snapshot.calculations?.printTime ? `Tempo de produção: ~${printTimeLabel(snapshot.calculations.printTime)}` : null,
  ].filter(Boolean);
  const greetingName = quote.customerName.trim();

  return (
    <main className="admin-shell quote-print-page">
      <div className="quote-print-toolbar">
        <Link href="/projects">← Voltar aos orçamentos</Link>
        <button type="button" onClick={() => window.print()}><IconDownload className="nav-icon" /> Imprimir / Salvar PDF</button>
      </div>

      <article className="quote-doc">
        <header className="quote-doc-header">
          <div className="quote-doc-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- arquivo estático em public/, formato fixo para o documento */}
            <img className="quote-doc-logo" src="/Logo.jpeg" alt={settings.companyName} />
            <div>
              <strong>{settings.companyName || "AC3D"}</strong>
              <span>Orçamento de produto/serviço em impressão 3D</span>
            </div>
          </div>
          <div className="quote-doc-meta">
            <strong>{quote.code ?? "—"}</strong>
            <span>Emitido em {dateLong(quote.createdAt)}</span>
            {quote.validUntil ? <span>Válido até {dateLong(quote.validUntil)}</span> : null}
          </div>
        </header>

        <hr className="quote-doc-hr" />

        <p className="quote-doc-greeting">
          {greetingName ? <>Olá, <strong>{greetingName}</strong>!</> : "Olá!"} Muito obrigado pelo interesse em nossos produtos — preparamos esta proposta com
          carinho especialmente para você. Confira os detalhes abaixo.
        </p>

        <hr className="quote-doc-hr" />

        <section className="quote-doc-item">
          <p className="quote-doc-section-title">Item orçado</p>
          <h2>{quote.productName}</h2>
          {specs.length ? <p className="quote-doc-specs">{specs.join(" · ")}</p> : null}
          {quote.notes.trim() ? <div className="quote-doc-notes">{quote.notes}</div> : null}
          {includedItems.length ? (
            <>
              <p className="quote-doc-section-title" style={{ marginTop: 18 }}>O que está incluso</p>
              <ul className="quote-doc-included">
                {includedItems.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </>
          ) : null}
        </section>

        <div className="quote-doc-price">
          <span>Valor total do orçamento</span>
          <strong>{brl(quote.finalPrice)}</strong>
        </div>

        <div className="quote-doc-terms">
          <div className="quote-doc-term">
            <strong>Prazo de produção</strong>
            <p>{settings.quoteDeliveryText || "A combinar."}</p>
          </div>
          <div className="quote-doc-term">
            <strong>Forma de pagamento</strong>
            <p>{settings.quotePaymentText || "A combinar."}</p>
          </div>
          <div className="quote-doc-term">
            <strong>Garantia do produto</strong>
            <p>{settings.quoteWarrantyText || "A combinar."}</p>
          </div>
        </div>

        <footer className="quote-doc-footer">
          <strong>{settings.companyName || "AC3D"}</strong>
          {settings.companyContact ? <p>{settings.companyContact}</p> : null}
          <p>Obrigado pela confiança! Qualquer dúvida, estamos à disposição.</p>
        </footer>
        <p className="quote-doc-fineprint">
          Orçamento {quote.code ?? ""}{quote.validUntil ? ` válido até ${dateLong(quote.validUntil)}` : ""} — sujeito a reajuste após essa data por variação no
          custo de material. Documento gerado automaticamente, sem necessidade de assinatura.
        </p>
      </article>
    </main>
  );
}
