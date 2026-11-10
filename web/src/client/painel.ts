"use client";
import { createContext, useContext } from "react";
import type { BaseCliente } from "./useBase";
import type { Atribuicao, Divergencia } from "@/domain/atribuicoes";
import type { ChaveAtribuicao, NovaAtribuicao } from "./atribuicoes";

// Base carregada + ações do painel, disponíveis para as abas (rotas) dentro da Casca.
export type ValorPainel = {
  base: BaseCliente;
  recarregar(): void;
  /** Abre o painel de fontes (PainelFontes, Task 11). */
  abrirFontes(): void;
  /** Atribuições de renovação (spec 2026-11-10). `base.linhas` já vem marcada por elas. Opcionais para os testes que
   *  montam o contexto à mão; use `atribuicoesDoPainel` para ler com os padrões. */
  atribuicoes?: Atribuicao[];
  divergencias?: Divergencia[];
  atribuicoesErro?: boolean;
  salvarAtribuicao?(a: NovaAtribuicao): Promise<void>;
  desfazerAtribuicao?(k: ChaveAtribuicao): Promise<void>;
};

const SEM_ESCRITA = () => Promise.reject(new Error("Atribuições indisponíveis."));
/** Atribuições do painel com padrões (lista vazia; salvar/desfazer rejeitam). */
export function atribuicoesDoPainel(v: ValorPainel) {
  return {
    atribuicoes: v.atribuicoes ?? [], divergencias: v.divergencias ?? [], erro: v.atribuicoesErro ?? false,
    salvar: v.salvarAtribuicao ?? SEM_ESCRITA, desfazer: v.desfazerAtribuicao ?? SEM_ESCRITA,
  };
}

export const ContextoPainel = createContext<ValorPainel | null>(null);

export function usePainel(): ValorPainel {
  const v = useContext(ContextoPainel);
  if (!v) throw new Error("usePainel fora da Casca");
  return v;
}
