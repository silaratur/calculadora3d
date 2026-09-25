"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/Icons";

/**
 * Alterna o tema claro/escuro do site inteiro — grava data-theme no <html> e
 * lembra a escolha neste navegador. O script em src/app/layout.tsx aplica a
 * escolha salva antes da página pintar, pra não piscar claro ao abrir no escuro.
 */
const themeStorageKey = "ac3d-theme";

type Theme = "light" | "dark";

// O tema "mora" no atributo data-theme do <html>: lê de lá e observa mudanças,
// assim qualquer instância do botão fica em sincronia.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
// No servidor não dá pra saber o tema salvo — null evita mostrar o ícone errado na hidratação.
const readServerTheme = (): Theme | null => null;

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, readServerTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // navegador sem armazenamento (aba anônima bloqueada): vale só até recarregar
    }
  }

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <button type="button" className={className ? `theme-toggle ${className}` : "theme-toggle"} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <IconSun className="nav-icon" /> : <IconMoon className="nav-icon" />}
    </button>
  );
}
