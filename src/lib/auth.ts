import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { parseRoles } from "@/lib/roles";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me",
);

export async function signToken(user: { id: string; email: string; role: string }) {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as {
    userId: string;
    email: string;
    role: string;
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    // Reconsultado do banco (não só decodificado do JWT) pra um usuário
    // desativado no meio da sessão de 7 dias parar de conseguir usar a API
    // na mesma hora, mesmo sem fazer logout.
    if (!user?.active) return null;
    return user;
  } catch {
    return null;
  }
}

/** Para rotas só de Administrador: devolve a resposta de erro, ou null se pode seguir. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!parseRoles(user.role).includes("ADMIN")) return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });
  return null;
}
