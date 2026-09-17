import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const channelSchema = z.object({
  name: z.string().min(2),
  commissionRate: z.number().min(0),
  fixedFee: z.number().min(0),
  adsRate: z.number().min(0),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.marketplaceChannel.findMany({ where: { active: true }, orderBy: { name: "asc" } }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = channelSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.marketplaceChannel.create({ data: { ...parsed.data, notes: parsed.data.notes ?? "" } }), { status: 201 });
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = channelSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.marketplaceChannel.update({ where: { id }, data: { ...parsed.data, notes: parsed.data.notes ?? "" } }));
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.marketplaceChannel.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
