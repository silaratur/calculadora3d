/**
 * Roda uma vez quando o servidor Next sobe.
 * - Promoções das campanhas (Loja → Plano de campanhas): cada peça recebe a
 *   campanha que vale agora; roda ao subir e a cada 10 min (DEV e produção).
 * - Agendador de publicações do Instagram — só no servidor de produção, com
 *   INSTAGRAM_AUTOPUBLISH=on e PUBLIC_APP_URL no .env. No DEV nada é publicado sozinho.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { syncCampaignPromos } = await import("./lib/campaign-plan");
  const { notifyStore } = await import("./lib/store-sync");
  const syncPromos = () => syncCampaignPromos()
    .then((changed) => { if (changed) { console.log(`[campanhas] promoção trocada em ${changed} peça(s)`); notifyStore(); } })
    .catch((error) => console.error("[campanhas] sincronização:", error));
  setTimeout(() => void syncPromos(), 15_000);
  setInterval(() => void syncPromos(), 10 * 60_000);

  if (process.env.INSTAGRAM_AUTOPUBLISH !== "on" || !process.env.PUBLIC_APP_URL) return;
  const { runInstagramScheduler } = await import("./lib/instagram-publisher");
  setInterval(() => void runInstagramScheduler().catch((error) => console.error("[instagram] agendador:", error)), 60_000);
  console.log("[instagram] agendador de publicações ligado");
}
