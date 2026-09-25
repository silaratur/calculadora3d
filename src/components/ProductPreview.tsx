"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@/components/Icons";

/**
 * Popup de produto (fotos + descrição breve) — o mesmo em todo lugar que mostra
 * foto de produto (Catálogo, Orçamentos, Projetos, Produção, orçamento em PDF).
 * Busca o produto pelo id na hora de abrir, então as telas só precisam saber o
 * id e a capa que já exibem.
 */

type PreviewProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string;
  extraImages?: string;
  price: number;
  active: boolean;
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// O popup é um card compacto — descrição longa quebraria o layout, então vai
// só um resumo (a completa continua no formulário do Catálogo).
const maxDescriptionChars = 140;
function shortDescription(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxDescriptionChars) return clean;
  const cut = clean.slice(0, maxDescriptionChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxDescriptionChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

// Paleta fixa (cores da marca + tons próximos) — cada categoria sempre cai na
// mesma cor, pra dar pra reconhecer categoria pela tarja sem ler o texto.
// Preenchido sólido de propósito: sobre foto de produto (fundo branco/claro
// na maioria das vezes) a tarja quase-branca de antes ficava invisível.
const categoryColors = ["#602f32", "#777f5d", "#a3402a", "#8a5a2e", "#4c6b7a", "#8a4a4e", "#5f6549", "#a3743a"];
// FNV-1a — espalha melhor que um hash ingênuo (soma/produto simples colidia
// justamente nas categorias reais do catálogo: "NATAL" e "Organização" caindo
// na mesma cor).
export function categoryColor(category: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < category.length; i += 1) {
    hash ^= category.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return categoryColors[(hash >>> 0) % categoryColors.length];
}

/** Capa + fotos extras (JSON em extraImages) na ordem de exibição. */
export function productImages(product: { imageUrl: string; extraImages?: string }) {
  let extra: string[] = [];
  try {
    const parsed: unknown = JSON.parse(product.extraImages || "[]");
    if (Array.isArray(parsed)) extra = parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    // extraImages corrompido: fica só com a capa.
  }
  return [product.imageUrl, ...extra].filter(Boolean);
}

/** Carrossel do card do Catálogo — setas/bolinhas trocam a foto, clicar na foto chama onOpen. */
export function ProductPhotoCarousel({ images, alt, onOpen }: { images: string[]; alt: string; onOpen?: () => void }) {
  const [index, setIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const current = Math.min(index, images.length - 1);
  const go = (next: number) => setIndex((next + images.length) % images.length);

  // Sem onOpen (dentro do próprio popup) a foto não é clicável.
  const clickable = (content: ReactNode) => onOpen ? (
    <button type="button" className="product-photo-link" onClick={onOpen} aria-label={`Ver fotos de ${alt}`}>{content}</button>
  ) : content;

  if (images.length === 1) {
    // eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso
    return clickable(<img src={images[0]} alt={alt} />);
  }

  return (
    <div
      className="photo-carousel"
      onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
      onTouchEnd={(event) => {
        if (touchStartX === null) return;
        const delta = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 40) go(current + (delta < 0 ? 1 : -1));
        setTouchStartX(null);
      }}
    >
      {clickable(
        <span className="photo-carousel-track" style={{ transform: `translateX(-${current * 100}%)` }}>
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- data URI local, next/image não otimiza isso
            <img key={i} src={src} alt={`${alt} — foto ${i + 1} de ${images.length}`} />
          ))}
        </span>,
      )}
      <button type="button" className="photo-carousel-arrow prev" onClick={() => go(current - 1)} aria-label="Foto anterior">‹</button>
      <button type="button" className="photo-carousel-arrow next" onClick={() => go(current + 1)} aria-label="Próxima foto">›</button>
      <span className="photo-carousel-dots">
        {images.map((_, i) => (
          <button type="button" key={i} className={i === current ? "active" : ""} onClick={() => setIndex(i)} aria-label={`Ver foto ${i + 1}`} />
        ))}
      </span>
    </div>
  );
}

export function ProductPreviewModal({ productId, fallbackName, fallbackImage, onClose }: { productId: string; fallbackName?: string; fallbackImage?: string; onClose: () => void }) {
  const [product, setProduct] = useState<PreviewProduct | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products?id=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) { setError(response.status === 404 ? "Este produto não está mais no Catálogo." : "Não foi possível carregar o produto."); return; }
        setProduct((await response.json()) as PreviewProduct);
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar o produto."); });
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const images = product ? productImages(product) : fallbackImage ? [fallbackImage] : [];
  const name = product?.name ?? fallbackName ?? "Produto";

  // Portal no body: os cards (Produção, Catálogo) têm overflow/transform que
  // cortariam ou deslocariam um position: fixed renderizado dentro deles.
  // Mesmo layout do card do Catálogo, só que sozinho e um pouco maior.
  return createPortal(
    <div className="modal-backdrop product-preview-backdrop" onClick={onClose}>
      <article className="product-card product-preview" role="dialog" aria-modal="true" aria-label={name} onClick={(event) => event.stopPropagation()}>
        <div className="product-card-photo">
          {images.length ? (
            // key: troca de capa provisória pra lista completa reinicia o carrossel na 1ª foto
            <ProductPhotoCarousel key={images.length} images={images} alt={name} />
          ) : (
            <span className="product-card-photo-placeholder">{name.slice(0, 1).toUpperCase()}</span>
          )}
          {product ? <span className="product-card-category" style={{ background: categoryColor(product.category) }}>{product.category}</span> : null}
          <button type="button" className="product-preview-close" onClick={onClose} aria-label="Fechar"><IconX className="nav-icon" /></button>
        </div>
        {product ? (
          <span className="product-preview-meta">
            <span className="material-badge">{product.sku}</span>
            {!product.active ? <span className="product-preview-archived">Arquivado</span> : null}
          </span>
        ) : null}
        <h2>{name}</h2>
        {error ? <p>{error}</p> : product ? (
          <>
            {product.description?.trim() ? <p className="card-description" title={product.description.trim()}>{shortDescription(product.description)}</p> : null}
            <strong className="price-highlight">{brl(product.price)}</strong>
          </>
        ) : <p>Carregando…</p>}
      </article>
    </div>,
    document.body,
  );
}

/** Envolve a foto de um produto: clicar abre o popup. Sem productId, mostra só a foto. */
export function ProductPhotoLink({ productId, name, image, className, children }: { productId?: string | null; name?: string; image?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!productId) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        className={className ? `product-photo-link ${className}` : "product-photo-link"}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        aria-label={`Ver fotos de ${name ?? "produto"}`}
      >
        {children}
      </button>
      {open ? <ProductPreviewModal productId={productId} fallbackName={name} fallbackImage={image} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
