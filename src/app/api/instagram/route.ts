import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { fetchInstagramProfile, getInstagramToken, instagramStatus, saveInstagramToken } from "@/lib/instagram";
import { prisma } from "@/lib/prisma";

// Só Administrador mexe na conexão: quem tem o token publica na conta.
const admin = requireAdmin;

export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json(await instagramStatus());
}

const tokenSchema = z.object({ token: z.string().trim().min(20).max(1000).regex(/^\S+$/) });

export async function PUT(request: Request) {
  const denied = await admin();
  if (denied) return denied;
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cole o token completo, sem espaços." }, { status: 400 });
  try {
    await saveInstagramToken(parsed.data.token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível validar o token." }, { status: 400 });
  }
  return NextResponse.json(await instagramStatus());
}

/** Testar conexão: só lê o perfil no Instagram, não publica nada. */
export async function POST() {
  const denied = await admin();
  if (denied) return denied;
  const token = await getInstagramToken();
  if (!token) return NextResponse.json({ error: "Nenhum token salvo." }, { status: 400 });
  try {
    const profile = await fetchInstagramProfile(token);
    await prisma.instagramConnection.update({ where: { id: "default" }, data: { username: profile.username, igUserId: String(profile.user_id), lastCheckedAt: new Date() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao falar com o Instagram." }, { status: 502 });
  }
  return NextResponse.json(await instagramStatus());
}

export async function DELETE() {
  const denied = await admin();
  if (denied) return denied;
  await prisma.instagramConnection.deleteMany({});
  return NextResponse.json({ connected: false });
}
