// Atribuição de renovações (spec: docs/superpowers/specs/2026-11-10-atribuicao-renovacoes-design.md).
// Um gestor atribui a VIGÊNCIA de uma apólice que chega para renovar (seguradora + número + fim) a outro
// colaborador. Isso marca, sem tocar em `colab`:
// - a base: a apólice dessa vigência e os endossos dela (mesmo seg|apólice, início em [vig, fim)) — `resp` = novo
//   responsável, `atrib` = 'base' e `tipoEfetivo` R/ER (para o novo responsável ela é carteira que renova);
// - a renovação: a R ligada à antiga (ligarRenovacoes: CPF/CNPJ + ramo + vigência) e os endossos dela — `resp` =
//   novo responsável, `atrib` = 'renovacao'; se a R saiu no nome de outro, `divergente` e entra em `divergencias`.
// Atribuição sem linha correspondente (planilha mudou) é ignorada; atribuir ao próprio colaborador não marca nada.
import type { DataISO, Linha } from './tipos';
import { isApolice, chaveApolice } from './situacoes';
import { candidatasRenovacao, ligarRenovacoes } from './renovacoes';
import type { VinculoRenovacao } from './vinculos-renovacao';

export type Atribuicao = { seg: string; apolice: string; fim: DataISO; para: string; de: string; por: string; em: string };
export type Divergencia = { antiga: Linha; renovacao: Linha; para: string };

export const chaveAtribuicao = (a: { seg: string; apolice: string; fim: DataISO }): string => `${a.seg}|${a.apolice}|${a.fim}`;
export { respDe, tipoMetaDe } from './responsavel';

const TIPO_BASE: Record<string, string> = { N: 'R', EN: 'ER' };

/** `vinculos`: pares manuais (domain/vinculos-renovacao.ts) — a atribuição segue a R vinculada como segue a ligada. */
export function aplicarAtribuicoes(linhas: Linha[], atribs: Atribuicao[], vinculos: VinculoRenovacao[] = []): { linhas: Linha[]; divergencias: Divergencia[] } {
  if (!atribs.length) return { linhas, divergencias: [] };
  const porApolice = new Map<string, number[]>();
  linhas.forEach((r, i) => {
    const k = chaveApolice(r);
    (porApolice.get(k) ?? porApolice.set(k, []).get(k)!).push(i);
  });
  const marcas = new Map<number, Partial<Linha>>();
  // Endossos da vigência [inicio, fim) da apólice `ap` (a própria apólice fica de fora: é marcada à parte).
  const endossos = (ap: Linha) => (porApolice.get(chaveApolice(ap)) ?? []).filter(i => {
    const e = linhas[i];
    return !isApolice(e) && !!e.vig && e.vig >= ap.vig && e.vig < ap.fim;
  });

  const antigas: { i: number; para: string }[] = [];
  for (const a of atribs) {
    const i = (porApolice.get(`${a.seg}|${a.apolice}`) ?? []).find(j => isApolice(linhas[j]) && linhas[j].fim === a.fim);
    if (i === undefined || linhas[i].colab === a.para) continue;
    antigas.push({ i, para: a.para });
    for (const j of [i, ...endossos(linhas[i])]) {
      const t = TIPO_BASE[linhas[j].tipo];
      marcas.set(j, { resp: a.para, atrib: 'base', ...(t ? { tipoEfetivo: t } : {}) });
    }
  }

  const divergencias: Divergencia[] = [];
  const indice = new Map(linhas.map((r, i) => [r, i] as const));
  const paraDe = new Map(antigas.map(x => [linhas[x.i], x.para] as const));
  // Liga sobre todas as candidatas (como a aba Renovações), não só as atribuídas: com dois carros do mesmo cliente o
  // par "prêmio mais parecido" depende do conjunto inteiro.
  const conjunto = new Set(candidatasRenovacao(linhas));
  for (const x of antigas) conjunto.add(linhas[x.i]);
  for (const item of ligarRenovacoes([...conjunto], linhas, vinculos)) {
    const ren = item.renovacao;
    const para = paraDe.get(item.antiga);
    if (!ren || para === undefined) continue;
    const ir = indice.get(ren)!;
    // Vigências seguidas: a R que tem a própria atribuição (como antiga do ano seguinte) fica com ela.
    if (marcas.get(ir)?.atrib === 'base') continue;
    const divergente = ren.colab !== para;
    if (divergente) divergencias.push({ antiga: item.antiga, renovacao: ren, para });
    for (const j of [ir, ...endossos(ren)]) {
      if (marcas.get(j)?.atrib === 'base') continue;
      marcas.set(j, { resp: para, atrib: 'renovacao', ...(divergente ? { divergente } : {}) });
    }
  }

  if (!marcas.size) return { linhas, divergencias };
  return { linhas: linhas.map((r, i) => (marcas.has(i) ? { ...r, ...marcas.get(i) } : r)), divergencias };
}
