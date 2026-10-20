"use client";
import { createContext, useContext } from "react";
import type { BaseCliente } from "./useBase";

// Base carregada + ações do painel, disponíveis para as abas (rotas) dentro da Casca.
export type ValorPainel = {
  base: BaseCliente;
  recarregar(): void;
  /** Abre o painel de fontes (PainelFontes, Task 11). */
  abrirFontes(): void;
};

export const ContextoPainel = createContext<ValorPainel | null>(null);

export function usePainel(): ValorPainel {
  const v = useContext(ContextoPainel);
  if (!v) throw new Error("usePainel fora da Casca");
  return v;
}
