import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COLLECTION_TONES } from "@/lib/showcase";
import { notifyStore } from "@/lib/store-sync";

/** Loja → Vitrine → coleções editáveis (criar, editar, pausar, excluir). */
const collectionSchema = z
  .object({
    title: z.string().trim().min(2).max(60),
    lead: z.string().trim().max(200).default(""),
    tone: z.enum(COLLECTION_TONES).default("vinho"),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    productIds: z.array(z.string().min(1)).min(1, "Escolha pelo menos uma peça").max(24),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((item) => !item.startsAt || !item.endsAt || item.endsAt.getTime() > item.startsAt.getTime(), { message: "O fim precisa ser depois do início", path: ["endsAt"] });

const dataOf = (input: z.infer<typeof collectionSchema>) => ({ ...input, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, productIds: JSON.stringify(input.productIds) });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = collectionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  const collection = await prisma.storeCollection.create({ data: dataOf(parsed.data) });
  notifyStore();
  return NextResponse.json(collection, { status: 201 });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  const parsed = collectionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os campos" }, { status: 400 });
  const collection = await prisma.storeCollection.update({ where: { id }, data: dataOf(parsed.data) });
  notifyStore();
  return NextResponse.json(collection);
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  await prisma.storeCollection.delete({ where: { id } });
  notifyStore();
  return NextResponse.json({ success: true });
}
