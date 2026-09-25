"use client";

import { useEffect, useState } from "react";

/**
 * Preços da concorrência por produto — aba do Catálogo (antes ficava em
 * Projetos, misturada com os orçamentos).
 */
type Competitor = { id: string; productName: string; competitor: string; channel: string; price: number; url: string; checkedAt: string };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompetitorPrices({ search }: { search: string }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/competitors", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Competitor[]) => { if (!cancelled) { setCompetitors(data); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = competitors.filter((item) => `${item.productName} ${item.competitor} ${item.channel}`.toLowerCase().includes(query));

  if (!loaded) return <p className="library-loading">Carregando...</p>;
  return (
    <div className="project-list">
      {filtered.length ? filtered.map((item) => (
        <article className="project-card competitor-card" key={item.id}>
          <div className="project-card-top">
            <span className="material-badge">Concorrência</span>
            <span>{new Date(item.checkedAt).toLocaleDateString("pt-BR")}</span>
          </div>
          <div className="project-card-heading">
            <div>
              <h2>{item.productName}</h2>
              <p>{item.competitor} · {item.channel || "Canal não informado"}</p>
            </div>
            <strong>{brl(item.price)}</strong>
          </div>
          {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Abrir anúncio</a> : null}
        </article>
      )) : <div className="empty-note">{competitors.length ? "Nenhum preço de concorrência bate com a busca." : "Nenhum preço de concorrência cadastrado ainda."}</div>}
    </div>
  );
}
