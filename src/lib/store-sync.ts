import { after } from "next/server";

/**
 * Avisa a loja (ac3d.silaratur.cloud) que o Catálogo mudou, para ela jogar
 * fora o cache e mostrar os dados novos na próxima visita. Roda depois da
 * resposta (não atrasa o salvar) e nunca derruba a requisição: se a loja
 * estiver fora do ar, ela se atualiza sozinha em até 60 s.
 * Precisa de STORE_URL e STORE_API_KEY (a mesma do .env da loja).
 */
export function notifyStore() {
  const url = process.env.STORE_URL?.replace(/\/$/, "");
  const key = process.env.STORE_API_KEY;
  if (!url || !key) return;
  after(async () => {
    try {
      await fetch(`${url}/api/revalidar`, { method: "POST", headers: { "x-store-key": key }, signal: AbortSignal.timeout(5000) });
    } catch {
      // Loja fora do ar: o ISR de 60 s dela cobre.
    }
  });
}
