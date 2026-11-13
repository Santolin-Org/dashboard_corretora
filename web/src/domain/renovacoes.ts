// Aba Renovações: o que chegou para renovar no período × as renovações que entraram nele, e a lista apólice por
// apólice com a renovação de cada uma.
//
// - Chegaram para renovar: apólices (sem endossos) N ou R cujo TÉRMINO de vigência cai no período, fora as que
//   saíram no meio da vigência (Cancelada, Perda Total, Suspensa) — essas nunca foram candidatas a renovar.
// - Renovações: apólices R cujo INÍCIO de vigência cai no período, com as mesmas exclusões.
// - A planilha diz se a antiga foi Renovada, mas não aponta a apólice nova (vem com outro número). A ligação é
//   CPF/CNPJ + ramo + vigência: a R do mesmo cliente e ramo que começa no fim da antiga (até 1 dia de diferença,
//   porque há seguradora que termina às 24h e outra que começa no dia seguinte). Com mais de uma candidata
//   (dois carros), cada R é usada uma vez só, ligada à antiga de prêmio mais parecido.
// - Os filtros globais de colaborador, grupo, ramo e seguradora valem; tipo e emissão não (a aba é, por
//   definição, N/R → R, e a emissão da antiga é do ano anterior).
import type { DataISO, Linha } from './tipos';
import type { FiltrosGlobais } from './filtros';
import { SIT, isApolice } from './situacoes';
import { respDe } from './responsavel';
import { dentroDaJanela, type VinculoRenovacao } from './vinculos-renovacao';

export type PeriodoRenov = { start: DataISO; end: DataISO };
export type SituacaoRenov = 'renovada' | 'vencida' | 'em-aberto';
/** `divergente`: a antiga foi atribuída e a R ligada saiu no nome de outro colaborador (domain/atribuicoes.ts). */
/** `manual`: a renovação veio de um vínculo feito pela gestão (domain/vinculos-renovacao.ts), não da ligação automática. */
export type ItemRenovacao = { antiga: Linha; renovacao: Linha | null; situacao: SituacaoRenov; divergente: boolean; manual: boolean };
/** Renovação que começou no período mas não renova nada do que venceu nele: a antiga é de outro vencimento
 *  (renovação adiantada ou atrasada) ou não foi achada (antiga cancelada, fora da base, CPF/ramo diferente). */
export type ItemOutroVencimento = { renovacao: Linha; antiga: Linha | null };
type Totais = { premio: number; com: number; qtd: number };
type TotaisPct = { premio: number | null; com: number | null; qtd: number | null };
export type CardsRenovacoes = {
  /** renovacoes: o que renovou do que chegou (prêmio/comissão das R ligadas; quantidade = renovadas).
   *  outros: R com início no período que não renovam nada do que chegou nele. */
  chegaram: Totais; renovacoes: Totais; outros: Totais; pct: TotaisPct; faltam: Totais;
  desfecho: { renovadas: number; vencidas: number; emAberto: number };
};

export const SIT_FORA_RENOVACOES: readonly string[] = [SIT.CANCELADA, SIT.PERDA_TOTAL, SIT.SUSPENSA];
export const ROTULO_SITUACAO_RENOV: Record<SituacaoRenov, string> = { renovada: 'Renovada', vencida: 'Vencida', 'em-aberto': 'Em aberto' };

const pad = (n: number) => String(n).padStart(2, '0');
const diaUtc = (d: DataISO) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

/** Vigência global quando as duas pontas estão preenchidas; senão, o mês corrente inteiro. */
export function periodoRenovacoes(f: Pick<FiltrosGlobais, 'vigIni' | 'vigFim'>, hoje: DataISO): PeriodoRenov {
  if (f.vigIni && f.vigFim) return { start: f.vigIni, end: f.vigFim };
  const a = +hoje.slice(0, 4), m = +hoje.slice(5, 7);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { start: `${a}-${pad(m)}-01`, end: `${a}-${pad(m)}-${pad(ultimo)}` };
}

function escopo(f: FiltrosGlobais): (r: Linha) => boolean {
  const col = new Set(f.col), grp = new Set(f.grp), ram = new Set(f.ram), seg = new Set(f.seg);
  // Colaborador pelo responsável efetivo: a apólice atribuída conta para quem cuida dela agora.
  return r => (!col.size || col.has(respDe(r))) && (!grp.size || grp.has(r.grp)) && (!ram.size || ram.has(r.ramo)) && (!seg.size || seg.has(r.seg));
}

const dentro = (d: DataISO, p: PeriodoRenov) => !!d && d >= p.start && d <= p.end;
const candidata = (r: Linha) => isApolice(r) && !SIT_FORA_RENOVACOES.includes(r.sit);

export function chegaramParaRenovar(linhas: Linha[], f: FiltrosGlobais, p: PeriodoRenov): Linha[] {
  const noEscopo = escopo(f);
  return linhas.filter(r => (r.tipo === 'N' || r.tipo === 'R') && candidata(r) && dentro(r.fim, p) && noEscopo(r));
}

export function renovacoesDoPeriodo(linhas: Linha[], f: FiltrosGlobais, p: PeriodoRenov): Linha[] {
  const noEscopo = escopo(f);
  return linhas.filter(r => r.tipo === 'R' && candidata(r) && dentro(r.vig, p) && noEscopo(r));
}

/** Antigas que podem chegar a renovar (N/R, sem endossos, com fim, fora Cancelada/Perda Total/Suspensa), na base
 *  inteira. A ligação com a renovação é sempre feita sobre este conjunto todo, para que a aba e a atribuição
 *  (domain/atribuicoes.ts) liguem igual mesmo com filtros (caso de dois carros do mesmo cliente). */
export function candidatasRenovacao(linhas: Linha[]): Linha[] {
  return linhas.filter(r => (r.tipo === 'N' || r.tipo === 'R') && candidata(r) && !!r.fim);
}

const chaveLigacao = (r: Linha) => `${r.docDigits}|${r.ramo}`;

/** Liga cada antiga à sua renovação (ver topo) e ordena por vencimento e cliente. `todas`: onde procurar as R. */
export function ligarRenovacoes(antigas: Linha[], todas: Linha[], vinculos: VinculoRenovacao[] = []): ItemRenovacao[] {
  const ligada = new Map<number, Linha>(), usadas = new Set<Linha>(), manuais = new Set<number>();
  // Vínculos manuais primeiro: o par fica fixo e nem a antiga nem a R entram na disputa automática. Vínculo cuja
  // antiga ou R sumiu da planilha (ou fora da regra: só R, até 90 dias depois do fim) é ignorado.
  if (vinculos.length) {
    const idxAntiga = new Map(antigas.map((a, i) => [`${a.seg}|${a.apolice}|${a.fim}`, i] as const));
    const rPorChave = new Map<string, Linha>();
    for (const r of todas) if (r.tipo === 'R' && isApolice(r) && !SIT_FORA_RENOVACOES.includes(r.sit) && r.vig) rPorChave.set(`${r.seg}|${r.apolice}|${r.vig}`, r);
    for (const v of vinculos) {
      const i = idxAntiga.get(`${v.seg}|${v.apolice}|${v.fim}`);
      const r = rPorChave.get(`${v.renSeg}|${v.renApolice}|${v.renVig}`);
      if (i === undefined || !r || ligada.has(i) || usadas.has(r) || !dentroDaJanela(v.fim, v.renVig)) continue;
      ligada.set(i, r); usadas.add(r); manuais.add(i);
    }
  }
  const porChave = new Map<string, Linha[]>();
  for (const r of todas) {
    if (r.tipo !== 'R' || !isApolice(r) || !r.docDigits || !r.vig) continue;
    const k = chaveLigacao(r);
    (porChave.get(k) ?? porChave.set(k, []).get(k)!).push(r);
  }
  const pares: { i: number; r: Linha; difPremio: number; difDias: number }[] = [];
  antigas.forEach((a, i) => {
    if (!a.docDigits || !a.fim || ligada.has(i)) return;
    for (const r of porChave.get(chaveLigacao(a)) ?? []) {
      if (r === a || usadas.has(r)) continue;
      const difDias = Math.abs(diaUtc(r.vig) - diaUtc(a.fim));
      if (difDias <= 1) pares.push({ i, r, difPremio: Math.abs(r.premio - a.premio), difDias });
    }
  });
  pares.sort((x, y) => x.difPremio - y.difPremio || x.difDias - y.difDias);
  for (const p of pares) {
    if (ligada.has(p.i) || usadas.has(p.r)) continue;
    ligada.set(p.i, p.r); usadas.add(p.r);
  }
  return antigas
    .map((antiga, i): ItemRenovacao => {
      const renovacao = ligada.get(i) ?? null;
      const situacao: SituacaoRenov = renovacao || antiga.sit === SIT.RENOVADA ? 'renovada' : antiga.sit === SIT.VENCIDA ? 'vencida' : 'em-aberto';
      return { antiga, renovacao, situacao, divergente: !!renovacao?.divergente, manual: manuais.has(i) };
    })
    .sort((x, y) => x.antiga.fim.localeCompare(y.antiga.fim) || x.antiga.cli.localeCompare(y.antiga.cli, 'pt-BR'));
}

const somar = (l: Linha[]): Totais => l.reduce((t, r) => ({ premio: t.premio + r.premio, com: t.com + r.com, qtd: t.qtd + 1 }), { premio: 0, com: 0, qtd: 0 });
const razao = (a: number, b: number) => (b ? a / b : null);

export function cardsRenovacoes(itens: ItemRenovacao[], renovacoesPeriodo: Linha[]): CardsRenovacoes {
  const conta = (sit: SituacaoRenov) => itens.filter(i => i.situacao === sit).length;
  const ligadas = itens.flatMap(i => (i.renovacao ? [i.renovacao] : []));
  const usadas = new Set(ligadas);
  const chegaram = somar(itens.map(i => i.antiga));
  const ren = { ...somar(ligadas), qtd: conta('renovada') };
  return {
    chegaram, renovacoes: ren, outros: somar(renovacoesPeriodo.filter(r => !usadas.has(r))),
    pct: { premio: razao(ren.premio, chegaram.premio), com: razao(ren.com, chegaram.com), qtd: razao(ren.qtd, chegaram.qtd) },
    faltam: { premio: Math.max(0, chegaram.premio - ren.premio), com: Math.max(0, chegaram.com - ren.com), qtd: Math.max(0, chegaram.qtd - ren.qtd) },
    desfecho: { renovadas: ren.qtd, vencidas: conta('vencida'), emAberto: conta('em-aberto') },
  };
}

/** Filtro da lista: situação, 'divergente' (R no nome de outro colaborador) ou '' = todas. */
export type FiltroListaRenov = SituacaoRenov | 'divergente' | '';
export function filtrarSituacaoRenov(itens: ItemRenovacao[], filtro: FiltroListaRenov): ItemRenovacao[] {
  if (!filtro) return itens;
  return itens.filter(i => (filtro === 'divergente' ? i.divergente : i.situacao === filtro));
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function casa(termo: string, docDigits: string, campos: string[]): boolean {
  const t = normalizar(termo.trim());
  if (!t) return true;
  const digitos = /^[\d.\-/\s]+$/.test(t) ? t.replace(/\D/g, '') : '';
  if (digitos && docDigits.includes(digitos)) return true;
  return campos.some(c => normalizar(c).includes(t));
}

/** Busca em cliente, CPF/CNPJ (com ou sem pontuação), apólice antiga e nova, seguradora, ramo e colaborador. */
export function buscarRenovacoes(itens: ItemRenovacao[], termo: string): ItemRenovacao[] {
  if (!termo.trim()) return itens;
  return itens.filter(({ antiga: a, renovacao: r }) =>
    casa(termo, a.docDigits, [a.cli, a.docDigits, a.apolice, r?.apolice ?? '', a.seg, a.ramo, a.colab, a.resp ?? '']));
}

/** A mesma busca, para as renovações de outros vencimentos (campos da R e a apólice antiga, quando há). */
export function buscarOutrosVencimentos(itens: ItemOutroVencimento[], termo: string): ItemOutroVencimento[] {
  if (!termo.trim()) return itens;
  return itens.filter(({ renovacao: r, antiga: a }) =>
    casa(termo, r.docDigits, [r.cli, r.docDigits, r.apolice, a?.apolice ?? '', r.seg, r.ramo, r.colab, r.resp ?? '']));
}

/** `livres` (base inteira, para os diálogos de vínculo): R candidatas sem antiga ligada e antigas candidatas sem
 *  renovação ligada. `vinculos`: pares manuais da gestão (domain/vinculos-renovacao.ts). */
export function dadosRenovacoes(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO, vinculos: VinculoRenovacao[] = []): {
  periodo: PeriodoRenov; itens: ItemRenovacao[]; outros: ItemOutroVencimento[]; cards: CardsRenovacoes;
  livres: { renovacoes: Linha[]; antigas: Linha[] };
} {
  const periodo = periodoRenovacoes(f, hoje);
  const chegaram = new Set(chegaramParaRenovar(linhas, f, periodo));
  const todas = ligarRenovacoes(candidatasRenovacao(linhas), linhas, vinculos);
  const itens = todas.filter(i => chegaram.has(i.antiga));
  const renovacoesPeriodo = renovacoesDoPeriodo(linhas, f, periodo);
  const usadas = new Set(itens.flatMap(i => (i.renovacao ? [i.renovacao] : [])));
  const antigaDe = new Map(todas.flatMap(i => (i.renovacao ? [[i.renovacao, i.antiga] as const] : [])));
  const outros = renovacoesPeriodo
    .filter(r => !usadas.has(r))
    .map((renovacao): ItemOutroVencimento => ({ renovacao, antiga: antigaDe.get(renovacao) ?? null }))
    .sort((x, y) => x.renovacao.vig.localeCompare(y.renovacao.vig) || x.renovacao.cli.localeCompare(y.renovacao.cli, 'pt-BR'));
  const ligadasBase = new Set(todas.flatMap(i => (i.renovacao ? [i.renovacao] : [])));
  const livres = {
    renovacoes: linhas.filter(r => r.tipo === 'R' && candidata(r) && !!r.vig && !ligadasBase.has(r)),
    antigas: todas.filter(i => !i.renovacao).map(i => i.antiga),
  };
  return { periodo, itens, outros, cards: cardsRenovacoes(itens, renovacoesPeriodo), livres };
}
