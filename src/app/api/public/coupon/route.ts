import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { corsHeaders } from "../products/route";

/** Confere o cupom digitado na sacola. O código em si nunca sai do sistema. */
export async function POST(request: Request) {
  const parsed = z.object({ code: z.string().trim().min(1).max(30) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false }, { status: 400, headers: corsHeaders });
  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const valid = Boolean(settings.storeCouponCode) && settings.storeCouponPercent > 0 && parsed.data.code.toUpperCase() === settings.storeCouponCode.toUpperCase();
  return NextResponse.json({ valid, percent: valid ? settings.storeCouponPercent : 0, code: valid ? settings.storeCouponCode : "" }, { headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
