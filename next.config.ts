import type { NextConfig } from "next";

// Não redirecionar mais "/" para "/calculator": isso era um desvio de quando
// a home era a tela antiga quebrada. Agora "/" é o Painel de verdade — o
// redirect a deixava permanentemente inacessível, mesmo pelo link "Painel"
// do próprio menu.
const nextConfig: NextConfig = {};

export default nextConfig;
