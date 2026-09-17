import Link from "next/link";

/**
 * Aviso de sessão expirada. Antes, a maioria das páginas simplesmente
 * mostrava listas vazias quando o cookie de login expirava, sem dizer por quê
 * — o usuário achava que tinha perdido dados. Toda página que busca dados
 * autenticados deve checar `status === 401` e mostrar isto.
 */
export function AuthBanner({ message = "Entre novamente para carregar os dados desta página." }: { message?: string }) {
  return (
    <div className="admin-auth-banner admin-auth-banner-simple">
      <div>
        <strong>Sessão expirada</strong>
        <p>{message}</p>
      </div>
      <Link className="primary-button" href="/">Ir para o login</Link>
    </div>
  );
}
