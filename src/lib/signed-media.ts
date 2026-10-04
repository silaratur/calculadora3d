import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link temporário e assinado para uma foto de produto, usado pela tarefa diária
 * da revisão de marca: o Higgsfield precisa baixar a foto original por URL e
 * não envia cabeçalho de autenticação. A assinatura usa REPORT_API_KEY e vale
 * por 48 h; sem a chave, nada é assinado.
 */
const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

export function signedProductImagePath(productId: string, index: number, hours = 48) {
  const secret = process.env.REPORT_API_KEY;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  return `/api/public/catalog-image/${productId}/${index}?exp=${exp}&sig=${sign(secret, `${productId}:${index}:${exp}`)}`;
}

export function validProductImageSignature(productId: string, index: string, exp: string | null, sig: string | null) {
  const secret = process.env.REPORT_API_KEY;
  if (!secret || !exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = sign(secret, `${productId}:${index}:${exp}`);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
