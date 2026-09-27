import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const testimonialSchema = z.object({
  name: z.string().trim().min(2).max(60),
  text: z.string().trim().min(5).max(400),
  context: z.string().trim().max(80).optional(),
});

async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await prisma.testimonial.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = testimonialSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const created = await prisma.testimonial.create({ data: { ...parsed.data, context: parsed.data.context ?? "" } });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  // Sai da loja mas fica no banco (mesmo padrão dos produtos arquivados).
  await prisma.testimonial.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
