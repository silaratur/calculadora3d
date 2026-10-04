import type { NextConfig } from "next";

// Não redirecionar mais "/" para "/calculator": isso era um desvio de quando
// a home era a tela antiga quebrada. Agora "/" é o Painel de verdade — o
// redirect a deixava permanentemente inacessível, mesmo pelo link "Painel"
// do próprio menu.
// A Calculadora antiga (/calculator) foi removida em 04/10/2026: Orçamentos
// cobre tudo, inclusive peça fora do Catálogo ("+ Peça sob medida").
// Quem tiver o endereço salvo cai em Orçamentos.
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/calculator", destination: "/orcamentos", permanent: false }];
  },
};

export default nextConfig;
