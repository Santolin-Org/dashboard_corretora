"use client";
import { useState, type ReactNode } from "react";
import s from "./SecaoRecolhivel.module.css";

// ── Collapsible sections (main.js toggleSection / sectionState) ────────────────
// O estado vive no módulo, como o `sectionState` global do app antigo: sobrevive à troca
// de aba (rota) dentro da mesma página. Toda seção começa aberta.
const estadoSecoes = new Map<string, boolean>();

export const secaoAberta = (chave: string): boolean => estadoSecoes.get(chave) ?? true;

export type SecaoRecolhivelProps = {
  /** Sufixo dos ids: sc-<chave>, cb-<chave>, sb-<chave>. */
  chave: string;
  /** Lado esquerdo do cabeçalho (use SecaoTitulo/SecaoBadge para os estilos originais). */
  cabecalho: ReactNode;
  /** Controles à direita, antes do botão −/+ (ex.: .metric-toggle). */
  controles?: ReactNode;
  /** Chamado ao reabrir (no app antigo, toggleSection redesenhava o gráfico da seção). */
  aoAbrir?(): void;
  children: ReactNode;
};

export function SecaoRecolhivel({ chave, cabecalho, controles, aoAbrir, children }: SecaoRecolhivelProps) {
  const [aberta, setAberta] = useState(() => secaoAberta(chave));
  const alternar = () => {
    const nova = !aberta;
    estadoSecoes.set(chave, nova);
    setAberta(nova);
    if (nova) aoAbrir?.();
  };
  return (
    <div className={`${s.card} section-card`} id={`sc-${chave}`}>
      <div className={`${s.header} section-header${aberta ? " open" : ""}`} onClick={alternar}>
        {cabecalho}
        {/* Como no index.html, a área de controles (inclusive o −/+) não propaga o clique. */}
        <div className={`${s.controles} section-controls`} onClick={(e) => e.stopPropagation()}>
          {controles}
          <button type="button" className={`${s.collapseBtn} collapse-btn`} id={`cb-${chave}`}>{aberta ? "−" : "+"}</button>
        </div>
      </div>
      <div className="section-body" id={`sb-${chave}`} style={aberta ? undefined : { display: "none" }}>
        {children}
      </div>
    </div>
  );
}

export function SecaoTitulo({ children }: { children: ReactNode }) {
  return <span className={`${s.titulo} section-title`}>{children}</span>;
}

export function SecaoBadge({ id, children }: { id?: string; children?: ReactNode }) {
  return <span className={`${s.tituloBadge} section-title-badge`} id={id}>{children}</span>;
}
