import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyStore } from "@/lib/store-sync";

/** Loja → Promoções → cupons (lista, criar, editar, pausar, excluir). */
const couponSchema = z
  .object({
    code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Use só letras, números, - e _"),
    kind: z.enum(["PERCENT", "FIXED"]),
    value: z.number().positive(),
    minOrder: z.number().min(0).default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    active: z.boolean().default(true),
    notes: z.string().trim().max(200).default(""),
  })
  .refine((coupon) => coupon.kind === "FIXED" || coupon.value <= 90, { message: "Desconto em % vai até 90%", path: ["value"] })
  .refine((coupon) => !coupon.startsAt || !coupon.endsAt || coupon.endsAt.getTime() > coupon.startsAt.getTime(), { message: "O fim precisa ser depois do início", path: ["endsAt"] });

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }));
}

function dataOf(input: z.infer<typeof couponSchema>) {
  return { ...input, code: input.code.toUpperCase(), startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, maxUses: input.maxUses ?? null };
}

const duplicate = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = couponSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  try {
    const coupon = await prisma.coupon.create({ data: dataOf(parsed.data) });
    notifyStore();
    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    if (duplicate(error)) return NextResponse.json({ error: "Já existe um cupom com esse código." }, { status: 409 });
    throw error;
  }
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = couponSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  try {
    const coupon = await prisma.coupon.update({ where: { id }, data: dataOf(parsed.data) });
    notifyStore();
    return NextResponse.json(coupon);
  } catch (error) {
    if (duplicate(error)) return NextResponse.json({ error: "Já existe um cupom com esse código." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.coupon.delete({ where: { id } });
  notifyStore();
  return NextResponse.json({ success: true });
}
