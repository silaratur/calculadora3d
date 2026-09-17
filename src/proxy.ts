import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");

/**
 * Sem isto, uma página protegida (ex: /calculator) renderizava normalmente
 * no navegador — com o menu inteiro visível — e só descobria "não
 * autenticado" depois, quando as chamadas de API voltavam 401. O sistema
 * inteiro só pode ficar disponível pra quem já tem sessão válida: aqui
 * redireciona pro login (`/`) antes de qualquer HTML da página protegida
 * chegar a ser enviado.
 */
export async function proxy(request: NextRequest) {
  // "/" é a própria tela de login — sem esta saída antecipada, visitar sem
  // sessão criaria um loop de redirecionamento nela mesma.
  if (request.nextUrl.pathname === "/") return NextResponse.next();

  const token = request.cookies.get("session_token")?.value;
  if (token) {
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      // token ausente/expirado/inválido — cai no redirect abaixo
    }
  }
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
