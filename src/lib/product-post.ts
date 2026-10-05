import { brl } from "@/lib/money";
import { applyPercent } from "@/lib/promotions";

// Divulgação a partir de um produto (Loja → Vitrine → "Criar post"): monta o
// rascunho de carrossel com as fotos do Catálogo e uma legenda no estilo das
// pautas aprovadas — preço sempre o do Catálogo (com a promoção que vale agora),
// CTA "link da bio", sem telefone/WhatsApp.

export type PostProduct = {
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  sizes: { name: string; price: number }[];
  colors: string[];
  promo: { percent: number; label: string } | null;
  images: string[];
};

const HASHTAGS: [RegExp, string[]][] = [
  [/natal/i, ["#decoracaonatalina", "#natal", "#arvoredenatal"]],
  [/brinquedo/i, ["#brinquedoarticulado", "#presenteinfantil", "#lembrancinhas"]],
  [/brinde|lembran/i, ["#lembrancinhas", "#brindespersonalizados"]],
  [/decora/i, ["#decoracao", "#casadecorada", "#decoracaominimalista"]],
  [/acess|utilidade/i, ["#presentecriativo", "#utilidades"]],
];

/** Primeiras frases da descrição, sem listas nem linhas de tamanho/cor (até ~280 letras, frase inteira). */
function lead(description: string) {
  const lines = description.split("\n").map((line) => line.trim()).filter((line) => line && !/^[-•]/.test(line) && !/^(tamanhos?|cores?|onde ela brilha)\b/i.test(line) && !line.endsWith(":"));
  const sentences = lines.join(" ").match(/[^.!?]+[.!?]+/g) ?? [lines.join(" ")];
  let text = "";
  for (const sentence of sentences.map((item) => item.trim())) {
    if (text && (text + " " + sentence).length > 280) break;
    text = text ? `${text} ${sentence}` : sentence;
  }
  return text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text;
}

/** Linha de preço igual à da loja: tamanhos ("a partir de") e promoção ("de/por"). */
export function priceLine(product: PostProduct) {
  const base = product.sizes.length ? Math.min(...product.sizes.map((size) => size.price)) : product.price;
  const from = product.sizes.length > 1 ? "a partir de " : "";
  if (product.promo && product.promo.percent > 0) {
    const now = applyPercent(base, product.promo.percent);
    return `🏷️ ${product.promo.label.trim() || "Promoção"} -${String(product.promo.percent).replace(".", ",")}%: ${from}${brl(now)} (antes ${brl(base)})`;
  }
  return `💰 ${from ? "A partir de " : ""}${brl(base)}`;
}

export function productCaption(product: PostProduct, productionDays: number) {
  const tags = new Set(["#impressao3d", "#ac3dstudio"]);
  for (const [pattern, list] of HASHTAGS) if (pattern.test(`${product.category} ${product.name}`)) list.forEach((tag) => tags.add(tag));
  const sizes = product.sizes.length > 1 ? ["📏 Tamanhos:", ...product.sizes.map((size) => `• ${size.name}: ${brl(product.promo ? applyPercent(size.price, product.promo.percent) : size.price)}`)].join("\n") : "";
  return [
    `${product.name} ✨`,
    "",
    lead(product.description),
    "",
    priceLine(product),
    sizes,
    product.colors.length ? `🎨 Cores: ${product.colors.join(", ")}` : "",
    `📦 Impresso em 3D aqui no estúdio, sob encomenda: pronto em até ${productionDays} dias úteis.`,
    "",
    "📌 Salve este post e envie para quem vai amar.",
    "Pedidos pelo link da bio.",
    "",
    [...tags].slice(0, 8).join(" "),
  ].filter((line, index, all) => line !== "" || (all[index - 1] !== "" && index > 0)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Foto do Catálogo (arquivo ou rota da mesma origem) → JPEG (data URI) para o Instagram. */
export function photoToJpeg(src: string, maxWidth = 1440, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Não foi possível carregar uma das fotos."));
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas indisponível neste navegador.")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = src;
  });
}
