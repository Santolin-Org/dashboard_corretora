import type { Papel } from "./db/schema";
import type { Linha } from "@/domain/tipos";
import { pertenceA } from "@/domain/painel-produtor";
import { aplicarAtribuicoes, chaveAtribuicao, type Atribuicao } from "@/domain/atribuicoes";
import { chaveVinculoAntiga, chaveVinculoRen, type VinculoRenovacao } from "@/domain/vinculos-renovacao";

/** `colaboradores`: vendedor com vínculo; `nomes` ordenados, sem vazios nem repetidos. `atribuicoes`: as renovações
 *  atribuídas a um dos nomes (só presente quando há alguma) — as linhas delas também vão para o vendedor. */
/** `vinculos`: vínculos manuais de renovação (a R vinculada segue a antiga atribuída; também mudam a chave do escopo). */
export type Escopo =
  | { tipo: "tudo" } | { tipo: "nada" }
  | { tipo: "colaboradores"; nomes: string[]; atribuicoes?: Atribuicao[]; vinculos?: VinculoRenovacao[] };

/** Único ponto que decide o que cada usuário pode receber. `nomes`: vínculos do próprio usuário. */
export function escopoDoUsuario(u: { role: Papel } | null, nomes: string[] = [], atribs: Atribuicao[] = [], vinculos: VinculoRenovacao[] = []): Escopo {
  if (u && (u.role === "admin" || u.role === "gestao")) return { tipo: "tudo" };
  if (u?.role === "vendedor") {
    const ns = [...new Set(nomes.filter((n) => n.trim() !== ""))].sort();
    const conjunto = new Set(ns);
    const minhas = atribs.filter((a) => pertenceA({ colab: a.para }, conjunto)); // "A , B" vale para A e para B
    // Vínculos sempre (com ou sem atribuição): entram na chave do escopo, então um vínculo novo muda o ETag do vendedor.
    if (ns.length) return { tipo: "colaboradores", nomes: ns, ...(minhas.length ? { atribuicoes: minhas } : {}), ...(vinculos.length ? { vinculos } : {}) };
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
  const marcadas = aplicarAtribuicoes(linhas, e.atribuicoes, e.vinculos).linhas;
  return linhas.filter((r, i) => pertenceA(r, nomes) || (marcadas[i].resp !== undefined && nomes.has(marcadas[i].resp!)));
}

/** Chave estável do escopo (cache do corpo e ETag). */
export const chaveEscopo = (e: Escopo): string =>
  JSON.stringify(
    e.tipo === "colaboradores"
      ? { tipo: e.tipo, nomes: [...e.nomes].sort(), ...(e.atribuicoes?.length ? { atribuicoes: e.atribuicoes.map((a) => `${chaveAtribuicao(a)}>${a.para}`).sort() } : {}),
          ...(e.vinculos?.length ? { vinculos: e.vinculos.map((v) => `${chaveVinculoAntiga(v)}<${chaveVinculoRen(v)}`).sort() } : {}) }
      : { tipo: e.tipo },
  );

export const podeReprocessar = (u: { role: Papel } | null): boolean => u?.role === "admin";

/** Vínculos que dizem respeito às linhas do recorte (a antiga ou a R está nelas): é o que o vendedor pode ver. */
export function vinculosDoRecorte(vinculos: VinculoRenovacao[], linhas: Linha[]): VinculoRenovacao[] {
  const fins = new Set(linhas.map((r) => `${r.seg}|${r.apolice}|${r.fim}`));
  const inicios = new Set(linhas.map((r) => `${r.seg}|${r.apolice}|${r.vig}`));
  return vinculos.filter((v) => fins.has(chaveVinculoAntiga(v)) || inicios.has(chaveVinculoRen(v)));
}
