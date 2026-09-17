import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const customerSchema = z.object({ name: z.string().min(2), email: z.string().email().or(z.literal("")), phone: z.string().optional(), notes: z.string().optional() });
async function authenticated() { return Boolean(await getCurrentUser()); }

export async function GET() {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(
    await prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { orders: { select: { id: true, totalAmount: true, paidAmount: true, createdAt: true } } },
    }),
  );
}

export async function POST(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = customerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.customer.create({ data: { ...parsed.data, email: parsed.data.email ?? "", phone: parsed.data.phone ?? "", notes: parsed.data.notes ?? "" } }), { status: 201 });
}

export async function PUT(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = customerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const customer = await prisma.customer.update({
    where: { id },
    data: { ...parsed.data, email: parsed.data.email ?? "", phone: parsed.data.phone ?? "", notes: parsed.data.notes ?? "" },
  });
  return NextResponse.json(customer);
}

export async function DELETE(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.customer.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
