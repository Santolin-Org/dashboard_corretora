import type { Papel } from "./db/schema";
import type { Linha } from "@/domain/tipos";
import { pertenceA } from "@/domain/painel-produtor";

/** `colaboradores`: vendedor com vínculo; `nomes` ordenados, sem vazios nem repetidos. */
export type Escopo = { tipo: "tudo" } | { tipo: "nada" } | { tipo: "colaboradores"; nomes: string[] };

/** Único ponto que decide o que cada usuário pode receber. `nomes`: vínculos do próprio usuário. */
export function escopoDoUsuario(u: { role: Papel } | null, nomes: string[] = []): Escopo {
  if (u && (u.role === "admin" || u.role === "gestao")) return { tipo: "tudo" };
  if (u?.role === "vendedor") {
    const ns = [...new Set(nomes.filter((n) => n.trim() !== ""))].sort();
    if (ns.length) return { tipo: "colaboradores", nomes: ns };
  }
  return { tipo: "nada" };
}

export function aplicarEscopo(linhas: Linha[], e: Escopo): Linha[] {
  if (e.tipo === "tudo") return linhas;
  if (e.tipo === "nada") return [];
  const nomes = new Set(e.nomes.filter((n) => n.trim() !== ""));
  return nomes.size ? linhas.filter((r) => pertenceA(r, nomes)) : [];
}

/** Chave estável do escopo (cache do corpo e ETag). */
export const chaveEscopo = (e: Escopo): string =>
  JSON.stringify(e.tipo === "colaboradores" ? { tipo: e.tipo, nomes: [...e.nomes].sort() } : { tipo: e.tipo });

export const podeReprocessar = (u: { role: Papel } | null): boolean => u?.role === "admin";
