import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const settingsSchema = z.object({
  energyRate: z.number().min(0),
  defaultPowerWatts: z.number().min(0),
  laborRate: z.number().min(0),
  monthlyRent: z.number().min(0),
  monthlySubscriptions: z.number().min(0),
  monthlyMaintenance: z.number().min(0),
  monthlyOtherCosts: z.number().min(0),
  monthlyPieces: z.number().min(1),
  defaultMarkup: z.number().min(0),
  defaultLossRate: z.number().min(0),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: {}, create: {} });
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const settings = await prisma.pricingSettings.upsert({ where: { id: "default" }, update: parsed.data, create: { id: "default", ...parsed.data } });
  return NextResponse.json(settings);
}