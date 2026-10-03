/**
 * Roda uma vez quando o servidor Next sobe. Liga o agendador de publicações
 * do Instagram — só no servidor de produção, com INSTAGRAM_AUTOPUBLISH=on e
 * PUBLIC_APP_URL no .env. No DEV nada é publicado sozinho.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INSTAGRAM_AUTOPUBLISH !== "on" || !process.env.PUBLIC_APP_URL) return;
  const { runInstagramScheduler } = await import("./lib/instagram-publisher");
  setInterval(() => void runInstagramScheduler().catch((error) => console.error("[instagram] agendador:", error)), 60_000);
  console.log("[instagram] agendador de publicações ligado");
}
