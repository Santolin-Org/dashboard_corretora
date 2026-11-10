import type { Papel } from "./db/schema";
import type { Linha } from "@/domain/tipos";
import { pertenceA } from "@/domain/painel-produtor";
import { aplicarAtribuicoes, chaveAtribuicao, type Atribuicao } from "@/domain/atribuicoes";

/** `colaboradores`: vendedor com vínculo; `nomes` ordenados, sem vazios nem repetidos. `atribuicoes`: as renovações
 *  atribuídas a um dos nomes (só presente quando há alguma) — as linhas delas também vão para o vendedor. */
export type Escopo = { tipo: "tudo" } | { tipo: "nada" } | { tipo: "colaboradores"; nomes: string[]; atribuicoes?: Atribuicao[] };

/** Único ponto que decide o que cada usuário pode receber. `nomes`: vínculos do próprio usuário. */
export function escopoDoUsuario(u: { role: Papel } | null, nomes: string[] = [], atribs: Atribuicao[] = []): Escopo {
  if (u && (u.role === "admin" || u.role === "gestao")) return { tipo: "tudo" };
  if (u?.role === "vendedor") {
    const ns = [...new Set(nomes.filter((n) => n.trim() !== ""))].sort();
    const minhas = atribs.filter((a) => ns.includes(a.para));
    if (ns.length) return { tipo: "colaboradores", nomes: ns, ...(minhas.length ? { atribuicoes: minhas } : {}) };
  }
  return { tipo: "nada" };
}

export function aplicarEscopo(linhas: Linha[], e: Escopo): Linha[] {
  if (e.tipo === "tudo") return linhas;
  if (e.tipo === "nada") return [];
  const nomes = new Set(e.nomes.filter((n) => n.trim() !== ""));
  if (!nomes.size) return [];
  if (!e.atribuicoes?.length) return linhas.filter((r) => pertenceA(r, nomes));
  // As linhas vão sem as marcas da atribuição: o cliente aplica de novo com a lista de /api/atribuicoes.
  const marcadas = aplicarAtribuicoes(linhas, e.atribuicoes).linhas;
  return linhas.filter((r, i) => pertenceA(r, nomes) || (marcadas[i].resp !== undefined && nomes.has(marcadas[i].resp!)));
}

/** Chave estável do escopo (cache do corpo e ETag). */
export const chaveEscopo = (e: Escopo): string =>
  JSON.stringify(
    e.tipo === "colaboradores"
      ? { tipo: e.tipo, nomes: [...e.nomes].sort(), ...(e.atribuicoes?.length ? { atribuicoes: e.atribuicoes.map((a) => `${chaveAtribuicao(a)}>${a.para}`).sort() } : {}) }
      : { tipo: e.tipo },
  );

export const podeReprocessar = (u: { role: Papel } | null): boolean => u?.role === "admin";
