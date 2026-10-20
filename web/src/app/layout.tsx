import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import "@/styles/tokens.css";

// Mesmas famílias e pesos que o index.html carregava do Google Fonts (aqui auto-hospedadas).
// tokens.css usa os nomes originais ('Inter', 'Syne', 'JetBrains Mono'), que são os nomes das
// @font-face geradas; assim glifos fora do subset (ex.: →) caem em system-ui como no app
// antigo, e não no "Inter Fallback" (Arial ajustada) que var(--fonte-*) incluiria.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-inter" });
const syne = Syne({ subsets: ["latin"], weight: ["600", "800"], variable: "--fonte-syne" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--fonte-mono" });

export const metadata: Metadata = {
  title: "Dashboard de Produção",
  description: "Painel da corretora Santolin",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${syne.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
