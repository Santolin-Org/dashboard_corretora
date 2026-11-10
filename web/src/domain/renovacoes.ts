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

export type PeriodoRenov = { start: DataISO; end: DataISO };
export type SituacaoRenov = 'renovada' | 'vencida' | 'em-aberto';
/** `divergente`: a antiga foi atribuída e a R ligada saiu no nome de outro colaborador (domain/atribuicoes.ts). */
export type ItemRenovacao = { antiga: Linha; renovacao: Linha | null; situacao: SituacaoRenov; divergente: boolean };
type Totais = { premio: number; com: number; qtd: number };
type TotaisPct = { premio: number | null; com: number | null; qtd: number | null };
export type CardsRenovacoes = {
  chegaram: Totais; renovacoes: Totais; pct: TotaisPct; faltam: Totais;
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

const chaveLigacao = (r: Linha) => `${r.docDigits}|${r.ramo}`;

/** Liga cada antiga à sua renovação (ver topo) e ordena por vencimento e cliente. `todas`: onde procurar as R. */
export function ligarRenovacoes(antigas: Linha[], todas: Linha[]): ItemRenovacao[] {
  const porChave = new Map<string, Linha[]>();
  for (const r of todas) {
    if (r.tipo !== 'R' || !isApolice(r) || !r.docDigits || !r.vig) continue;
    const k = chaveLigacao(r);
    (porChave.get(k) ?? porChave.set(k, []).get(k)!).push(r);
  }
  const pares: { i: number; r: Linha; difPremio: number; difDias: number }[] = [];
  antigas.forEach((a, i) => {
    if (!a.docDigits || !a.fim) return;
    for (const r of porChave.get(chaveLigacao(a)) ?? []) {
      if (r === a) continue;
      const difDias = Math.abs(diaUtc(r.vig) - diaUtc(a.fim));
      if (difDias <= 1) pares.push({ i, r, difPremio: Math.abs(r.premio - a.premio), difDias });
    }
  });
  pares.sort((x, y) => x.difPremio - y.difPremio || x.difDias - y.difDias);
  const ligada = new Map<number, Linha>(), usadas = new Set<Linha>();
  for (const p of pares) {
    if (ligada.has(p.i) || usadas.has(p.r)) continue;
    ligada.set(p.i, p.r); usadas.add(p.r);
  }
  return antigas
    .map((antiga, i): ItemRenovacao => {
      const renovacao = ligada.get(i) ?? null;
      const situacao: SituacaoRenov = renovacao || antiga.sit === SIT.RENOVADA ? 'renovada' : antiga.sit === SIT.VENCIDA ? 'vencida' : 'em-aberto';
      return { antiga, renovacao, situacao, divergente: !!renovacao?.divergente };
    })
    .sort((x, y) => x.antiga.fim.localeCompare(y.antiga.fim) || x.antiga.cli.localeCompare(y.antiga.cli, 'pt-BR'));
}

const somar = (l: Linha[]): Totais => l.reduce((t, r) => ({ premio: t.premio + r.premio, com: t.com + r.com, qtd: t.qtd + 1 }), { premio: 0, com: 0, qtd: 0 });
const razao = (a: number, b: number) => (b ? a / b : null);

export function cardsRenovacoes(itens: ItemRenovacao[], renovacoes: Linha[]): CardsRenovacoes {
  const chegaram = somar(itens.map(i => i.antiga)), ren = somar(renovacoes);
  const conta = (s: SituacaoRenov) => itens.filter(i => i.situacao === s).length;
  return {
    chegaram, renovacoes: ren,
    pct: { premio: razao(ren.premio, chegaram.premio), com: razao(ren.com, chegaram.com), qtd: razao(ren.qtd, chegaram.qtd) },
    faltam: { premio: Math.max(0, chegaram.premio - ren.premio), com: Math.max(0, chegaram.com - ren.com), qtd: Math.max(0, chegaram.qtd - ren.qtd) },
    desfecho: { renovadas: conta('renovada'), vencidas: conta('vencida'), emAberto: conta('em-aberto') },
  };
}

/** Filtro da lista: situação, 'divergente' (R no nome de outro colaborador) ou '' = todas. */
export type FiltroListaRenov = SituacaoRenov | 'divergente' | '';
export function filtrarSituacaoRenov(itens: ItemRenovacao[], filtro: FiltroListaRenov): ItemRenovacao[] {
  if (!filtro) return itens;
  return itens.filter(i => (filtro === 'divergente' ? i.divergente : i.situacao === filtro));
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca em cliente, CPF/CNPJ (com ou sem pontuação), apólice antiga e nova, seguradora, ramo e colaborador. */
export function buscarRenovacoes(itens: ItemRenovacao[], termo: string): ItemRenovacao[] {
  const t = normalizar(termo.trim());
  if (!t) return itens;
  const digitos = /^[\d.\-/\s]+$/.test(t) ? t.replace(/\D/g, '') : '';
  return itens.filter(({ antiga: a, renovacao: r }) => {
    if (digitos && a.docDigits.includes(digitos)) return true;
    return [a.cli, a.docDigits, a.apolice, r?.apolice ?? '', a.seg, a.ramo, a.colab, a.resp ?? ''].some(c => normalizar(c).includes(t));
  });
}

export function dadosRenovacoes(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO): { periodo: PeriodoRenov; itens: ItemRenovacao[]; cards: CardsRenovacoes } {
  const periodo = periodoRenovacoes(f, hoje);
  const itens = ligarRenovacoes(chegaramParaRenovar(linhas, f, periodo), linhas);
  return { periodo, itens, cards: cardsRenovacoes(itens, renovacoesDoPeriodo(linhas, f, periodo)) };
}
