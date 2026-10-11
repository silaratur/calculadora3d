import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Mesmas fontes do site de referência (calculadoraminima3d.com.br): Plus
// Jakarta Sans em todo o corpo — sem serifa em lugar nenhum — e JetBrains
// Mono nos valores monetários que pedem alinhamento tabular.
// Arquivos locais (variáveis, subconjunto latin do Google Fonts): o
// next/font/google quebrou o `next dev` com Turbopack em 11/10/2026 ("Can't
// resolve @vercel/turbopack-next/internal/font/google/font") e assim o app
// também não depende do Google na hora do build.
const sans = localFont({
  src: "./fonts/plus-jakarta-sans.woff2",
  variable: "--font-sans",
  weight: "200 800",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AC3D | Gestão de Produção",
  description: "Sistema de catálogo, precificação e gestão de custos para produtos 3D.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const themeScript = `try{if(localStorage.getItem("ac3d-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      // data-theme é gravado pelo script abaixo antes da hidratação.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo (ThemeToggle) antes de pintar — sem isso quem usa
            o escuro veria a página clara piscar a cada navegação. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
