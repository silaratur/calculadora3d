import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const competitorSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(2),
  competitor: z.string().min(2),
  channel: z.string().optional(),
  price: z.number().min(0),
  quantity: z.number().positive().optional(), // peças do anúncio ÷ peças do meu produto (pode ser < 1)
  shipping: z.number().min(0).optional(),
  notes: z.string().max(300).optional(),
  url: z.string().url().or(z.literal("")).optional(),
  checkedAt: z.coerce.date().optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.competitorPrice.findMany({ orderBy: { checkedAt: "desc" }, take: 1000 }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = competitorSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.competitorPrice.create({ data: { ...parsed.data, productId: parsed.data.productId ?? null, channel: parsed.data.channel ?? "", url: parsed.data.url ?? "" } }), { status: 201 });
}

/** Atualizar um anúncio já acompanhado (preço novo, frete, quantidade…). */
export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = competitorSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.competitorPrice.update({ where: { id }, data: { ...parsed.data, productId: parsed.data.productId ?? null, channel: parsed.data.channel ?? "", url: parsed.data.url ?? "" } }));
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.competitorPrice.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
