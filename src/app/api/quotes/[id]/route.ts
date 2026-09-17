import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authenticated() {
  return Boolean(await getCurrentUser());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticated())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  return NextResponse.json(quote);
}
