import type { Metadata } from "next";
import "@/styles/fontes.css";
import "@/styles/tokens.css";
import "@/styles/tabelas.css";
import "@/styles/campanha.css";
import "@/styles/metas.css";
import "@/styles/apresentacao.css";
import "@/styles/exibicao-tv.css";

// Mesmas famílias e pesos que o index.html carregava do Google Fonts, auto-hospedadas em
// src/styles/fontes.css (arquivos no repositório: dev e build não dependem da rede). tokens.css usa os
// nomes originais ('Inter', 'Syne', 'JetBrains Mono'); glifos fora do subset (ex.: →) caem em system-ui
// como no app antigo.

export const metadata: Metadata = {
  title: "Dashboard de Produção",
  description: "Painel da corretora Santolin",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
