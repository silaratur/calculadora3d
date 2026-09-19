import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** Quem está logado agora — usado pelo AdminHeader pra parar de mostrar um e-mail fixo no código. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
