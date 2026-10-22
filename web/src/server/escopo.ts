import type { Papel } from "./db/schema";

// Etapa 3 acrescenta { tipo: "colaboradores"; colabs: string[] }.
export type Escopo = { tipo: "tudo" } | { tipo: "nada" };

/** Único ponto que decide o que cada usuário pode receber. */
export function escopoDoUsuario(u: { role: Papel } | null): Escopo {
  if (u && (u.role === "admin" || u.role === "gestao")) return { tipo: "tudo" };
  return { tipo: "nada" };
}

export function aplicarEscopo<T>(linhas: T[], e: Escopo): T[] {
  return e.tipo === "tudo" ? linhas : [];
}

export const podeReprocessar = (u: { role: Papel } | null): boolean => u?.role === "admin";
