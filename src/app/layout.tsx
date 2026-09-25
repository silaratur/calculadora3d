import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Mesmas fontes do site de referência (calculadoraminima3d.com.br): Plus
// Jakarta Sans em todo o corpo — sem serifa em lugar nenhum — e JetBrains
// Mono nos valores monetários que pedem alinhamento tabular.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
