import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { couponProblem } from "@/lib/promotions";
import { corsHeaders } from "../products/route";

/**
 * Confere o cupom digitado na sacola (Loja → Promoções). O código em si nunca
 * sai do sistema antes de o cliente acertar; `subtotal` (total das peças já com
 * promoção e desconto por quantidade) confere a compra mínima.
 */
export async function POST(request: Request) {
  const parsed = z.object({ code: z.string().trim().min(1).max(30), subtotal: z.number().min(0).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false }, { status: 400, headers: corsHeaders });
  const coupon = await prisma.coupon.findUnique({ where: { code: parsed.data.code.toUpperCase() } });
  if (!coupon) return NextResponse.json({ valid: false, reason: "Cupom não encontrado. Confira as letras e os números." }, { headers: corsHeaders });
  // Compra mínima não invalida o cupom: a sacola guarda e mostra quanto falta.
  const problem = couponProblem(coupon, null);
  if (problem) return NextResponse.json({ valid: false, reason: problem }, { headers: corsHeaders });
  return NextResponse.json(
    { valid: true, code: coupon.code, kind: coupon.kind, value: coupon.value, minOrder: coupon.minOrder, percent: coupon.kind === "PERCENT" ? coupon.value : 0 },
    { headers: corsHeaders },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
