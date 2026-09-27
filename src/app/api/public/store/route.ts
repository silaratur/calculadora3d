import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders } from "../products/route";

/**
 * Informações comerciais que a loja pública mostra (sem login): os mesmos
 * textos do orçamento em PDF (prazo, pagamento, garantia), o prazo de produção
 * em dias úteis e as faixas de desconto por quantidade — tudo editado em
 * Configurações. Nada de custo interno sai daqui.
 */
export async function GET() {
  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  let qtyDiscounts: { minQty: number; percent: number }[] = [];
  try {
    const parsed: unknown = JSON.parse(settings.storeQtyDiscounts);
    if (Array.isArray(parsed)) {
      qtyDiscounts = parsed
        .filter((tier): tier is { minQty: number; percent: number } => typeof tier?.minQty === "number" && typeof tier?.percent === "number")
        .sort((a, b) => a.minQty - b.minQty);
    }
  } catch {
    // JSON inválido: loja sem desconto por quantidade.
  }
  return NextResponse.json(
    {
      companyName: settings.companyName,
      productionDays: settings.storeProductionDays,
      deliveryText: settings.quoteDeliveryText,
      paymentText: settings.quotePaymentText,
      warrantyText: settings.quoteWarrantyText,
      qtyDiscounts,
    },
    { headers: { ...corsHeaders, "Cache-Control": "public, max-age=60" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
