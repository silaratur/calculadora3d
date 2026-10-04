"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { AuthBanner } from "@/components/AuthBanner";
import { brl } from "@/lib/money";
import { displayNumber } from "@/lib/sales";

type Summary = {
  counts: { published: number; hidden: number; inReview: number; active: number };
  orders30: { count: number; total: number; converted: number };
  recentOrders: { id: string; code: string | null; customerName: string; productName: string; finalPrice: number; status: string; source: string; createdAt: string; link: string }[];
  attention: { sku: string; name: string; kind: "revisao" | "fotos" | "concorrencia"; text: string; link: string }[];
  posts: { id: string; title: string; kind: string; status: string; scheduledAt: string | null }[];
  offers: { coupons: { code: string; label: string }[]; promos: { active: number; scheduled: number }; freeShippingMin: number; productionDays: number };
  hidden: { sku: string; name: string; price: number }[];
};

const STORE_URL = "https://ac3d.silaratur.cloud";
const listLimit = 6;
const quoteStatus: Record<string, string> = { DRAFT: "em aberto", CONVERTED: "virou venda", ARCHIVED: "arquivado" };
const postKind: Record<string, string> = { CAROUSEL: "Carrossel", IMAGE: "Post", STORY: "Story", REEL: "Reel" };
const attentionTag: Record<Summary["attention"][number]["kind"], string> = { revisao: "revisão de marca", fotos: "fotos", concorrencia: "concorrência" };

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function StoreOverviewPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "login" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/loja/resumo", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) { setState("login"); return; }
        if (!response.ok) { setState("error"); return; }
        setData((await response.json()) as Summary);
        setState("ok");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="admin-shell">
      <AdminHeader active="loja" />
      <div className="admin-content">
        {state === "login" ? <AuthBanner message="Entre novamente para ver a loja." /> : null}
        <section className="library-heading">
          <div>
            <h1>Loja online</h1>
            <p>Resumo de <a href={STORE_URL} target="_blank" rel="noreferrer">ac3d.silaratur.cloud</a>: vitrine, pedidos e divulgação.</p>
          </div>
        </section>

        {state === "loading" ? <p className="library-loading">Carregando...</p> : null}
        {state === "error" ? <div className="empty-note">Não foi possível carregar o resumo da loja agora.</div> : null}

        {data ? (
          <>
            <section className="today-money store-numbers">
              <div><span>Na vitrine</span><strong className="num">{data.counts.published}</strong><small>de {data.counts.active} produtos ativos</small></div>
              <div><span>Fora da vitrine</span><strong className="num">{data.counts.hidden}</strong><small>ocultos por você</small></div>
              <div><span>Em revisão de marca</span><strong className="num">{data.counts.inReview}</strong><small>fora da loja até aprovar</small></div>
              <div><span>Pedidos pela loja</span><strong className="num">{data.orders30.count}</strong><small>últimos 30 dias · {data.orders30.converted} viraram venda</small></div>
              <div><span>Valor dos pedidos</span><strong className="num">{brl(data.orders30.total)}</strong><small>últimos 30 dias</small></div>
            </section>

            <section className="today-lists store-lists">
              <article className="today-list">
                <header>
                  <h2>Precisa de atenção <b>{data.attention.length}</b></h2>
                </header>
                {data.attention.length ? (
                  <ul>
                    {data.attention.slice(0, listLimit).map((item) => (
                      <li key={`${item.kind}-${item.sku}`}>
                        <a href={item.link} target={item.link.startsWith("http") ? "_blank" : undefined} rel={item.link.startsWith("http") ? "noreferrer" : undefined}>
                          <span className="today-item-main">{item.name} <em className={item.kind === "revisao" ? "today-tag urgent" : "today-tag"}>{attentionTag[item.kind]}</em></span>
                          <small>{item.sku} · {item.text}</small>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="today-empty">Tudo em ordem na vitrine.</p>}
                <Link className="today-more" href="/catalog">{data.attention.length > listLimit ? `Ver todos os ${data.attention.length} itens no Catálogo` : "Abrir Catálogo"}</Link>
              </article>

              <article className="today-list">
                <header>
                  <h2>Pedidos da loja <b>{data.recentOrders.length}</b></h2>
                  <span>mais recentes</span>
                </header>
                {data.recentOrders.length ? (
                  <ul>
                    {data.recentOrders.map((order) => (
                      <li key={order.id}>
                        <Link href={order.link}>
                          <span className="today-item-main">{order.productName}{order.source === "loja-encomenda" ? <em className="today-tag">encomenda</em> : null}</span>
                          <small>{order.code ? `${displayNumber(order.code)} · ` : ""}{order.customerName || "sem nome"} · {new Date(order.createdAt).toLocaleDateString("pt-BR")} · {quoteStatus[order.status] ?? order.status}</small>
                        </Link>
                        <span className="today-item-side num">{order.finalPrice ? brl(order.finalPrice) : "a orçar"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="today-empty">Nenhum pedido chegou pela loja ainda.</p>}
                <Link className="today-more" href="/projects">Abrir Orçamentos em aberto</Link>
              </article>

              <article className="today-list">
                <header>
                  <h2>Próximas publicações <b>{data.posts.length}</b></h2>
                  <span>Instagram</span>
                </header>
                {data.posts.length ? (
                  <ul>
                    {data.posts.map((post) => (
                      <li key={post.id}>
                        <Link href="/divulgacao">
                          <span className="today-item-main">{post.title}{post.status === "DRAFT" ? <em className="today-tag urgent">aprovar</em> : null}</span>
                          <small>{postKind[post.kind] ?? post.kind} · {post.scheduledAt ? when(post.scheduledAt) : "sem data"}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="today-empty">Nada agendado na Divulgação.</p>}
                <Link className="today-more" href="/divulgacao">Abrir Divulgação</Link>
              </article>
            </section>

            <h2 className="today-section-title">Ofertas ativas</h2>
            <section className="store-offers">
              <p><span>Promoções</span><strong className="num">{data.offers.promos.active ? `${data.offers.promos.active} ${data.offers.promos.active === 1 ? "produto" : "produtos"} em promoção` : "nenhuma ativa"}{data.offers.promos.scheduled ? ` · ${data.offers.promos.scheduled} agendada(s)` : ""}</strong></p>
              <p><span>Cupons</span><strong>{data.offers.coupons.length ? data.offers.coupons.map((coupon) => `${coupon.code} (${coupon.label})`).join(" · ") : "nenhum ativo"}</strong></p>
              <p><span>Frete grátis</span><strong className="num">{data.offers.freeShippingMin > 0 ? `a partir de ${brl(data.offers.freeShippingMin)}` : "não oferecido"}</strong></p>
              <p><span>Prazo de produção</span><strong className="num">{data.offers.productionDays} dias úteis</strong></p>
              <Link className="secondary-button" href="/loja/promocoes">Gerenciar promoções e cupons</Link>
            </section>
            {data.hidden.length ? (
              <p className="store-hidden">Fora da vitrine: {data.hidden.map((item) => `${item.sku} ${item.name}`).join(" · ")}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
