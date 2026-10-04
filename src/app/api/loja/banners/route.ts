import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyStore } from "@/lib/store-sync";

/** Loja → Vitrine → banner da abertura da loja (criar, editar, pausar, excluir). */
const bannerSchema = z
  .object({
    title: z.string().trim().min(2).max(70),
    subtitle: z.string().trim().max(200).default(""),
    buttonLabel: z.string().trim().max(30).default(""),
    // "produto:<SKU>", "colecao:<id>" ou link https.
    target: z.string().trim().max(300).refine((value) => value === "" || /^(produto:|colecao:|https:\/\/)/.test(value), "Destino inválido").default(""),
    productId: z.string().min(1).nullable().optional(),
    imageIndex: z.number().int().min(0).max(10).default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((item) => !item.startsAt || !item.endsAt || item.endsAt.getTime() > item.startsAt.getTime(), { message: "O fim precisa ser depois do início", path: ["endsAt"] });

const dataOf = (input: z.infer<typeof bannerSchema>) => ({ ...input, productId: input.productId ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = bannerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  const banner = await prisma.storeBanner.create({ data: dataOf(parsed.data) });
  notifyStore();
  return NextResponse.json(banner, { status: 201 });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = bannerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  const banner = await prisma.storeBanner.update({ where: { id }, data: dataOf(parsed.data) });
  notifyStore();
  return NextResponse.json(banner);
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.storeBanner.delete({ where: { id } });
  notifyStore();
  return NextResponse.json({ success: true });
}
