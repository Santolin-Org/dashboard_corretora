// Aba Retenção & Churn (main.js 1522–1571 e 1776–2142) e as exportações 'churn' e 'detalhe' do
// exportData: cálculos puros, sem DOM. Regras de negócio em METRICAS.md; o main.js é a referência.
import type { DataISO, Linha } from './tipos';
import { classifyRamo, normRamo } from './ramos';
import { SIT, isApolice } from './situacoes';
import { colabsComProducao } from './filtros';
import { saudeFaturaConta } from './saude/aplicar';
import { fBRL, fN, fP } from './formatos';
import { churnSaida } from './producao/enriquecimentos';

// ── Churn evitável ────────────────────────────────────────────────────────────
// Motivos de cancelamento que a corretora não tinha como evitar (comparação pelo
// texto normalizado com normRamo: sem acento, maiúsculas). Qualquer motivo fora da
// lista — inclusive o cancelamento sem motivo — conta como evitável.
// Levantamento dos motivos da produção de 2026 em METRICAS.md.
export const MOTIVOS_NAO_EVITAVEIS = new Set([
  'VENDA DO VEICULO', 'VENDA DO IMOVEL',                       // o bem saiu do cliente
  'APOLICE REEMITIDA', 'EMITIDA NOVA PROPOSTA',                // o contrato continuou em outra apólice
  'EMISSAO INDEVIDA', 'APOLICE CANCELADA POR ERRO DE EMISSAO', // erro operacional, não perda de cliente
  'DADOS INCORRETOS', 'DADOS DO VEICULO INCORRETO',
  'PERDA TOTAL', 'CANCELAMENTO DE APOLICE - SINISTRO INDEN',   // sinistro integral
  'FALECIDO',
].map(normRamo));
// Cancelamento (a apólice cancelada ou o endosso CN/CR) não evitável: pelo motivo, ou
// porque o cliente manteve o saldo de apólices (troca de seguradora, ver
// applyTrocaSeguradora).
export const isMotivoNaoEvitavel = (r: Pick<Linha, 'motivo'>): boolean => MOTIVOS_NAO_EVITAVEIS.has(normRamo(r.motivo));
export function isCancelNaoEvitavel(r: Pick<Linha, 'sit' | 'tipo' | 'motivo' | 'trocaSeg'>): boolean {
  const cancel = r.sit === SIT.CANCELADA || r.tipo === 'CN' || r.tipo === 'CR';
  return cancel && (isMotivoNaoEvitavel(r) || !!r.trocaSeg);
}

// Regras de negócio do churn que valem antes de qualquer filtro: ramo fora da meta e,
// no modo só evitável, cancelamento não evitável.
export function isForaDoChurn(r: Linha, soEvitavel: boolean): boolean {
  return classifyRamo(r.ramo) === 'excluded' || (soEvitavel && isCancelNaoEvitavel(r));
}

// ── Filtros próprios da aba (RET_MS, retActiveTipos, retSoEvitavel) ────────────
// Independentes dos filtros globais: a aba lê ALL inteiro. Listas vazias = todos.
export type FiltrosRetencao = { col: string[]; ram: string[]; grp: string[]; mot: string[]; tipos: string[]; soEvitavel: boolean };
/** Valores iniciais do topo do main.js: RET_MS vazio, retActiveTipos vazio, retSoEvitavel = true. */
export const FILTROS_RET_INICIAIS: FiltrosRetencao = Object.freeze({ col: [], ram: [], grp: [], mot: [], tipos: [], soEvitavel: true }) as FiltrosRetencao;

/** Período da aba como { s, e } em 'AAAA-MM-DD'. Campo vazio = sem limite daquele lado. */
export type PeriodoRet = { s: DataISO; e: DataISO };
/** setRetPeriodoPadrao: 1º de janeiro do ano corrente até hoje. */
export const periodoPadraoRet = (hoje: DataISO): PeriodoRet => ({ s: `${hoje.slice(0, 4)}-01-01`, e: hoje });

// Só os filtros de dimensão. O período não entra aqui porque cada painel o aplica
// com a data que faz sentido para ele (ver isChurnBase / isChurnPerda).
// Regra de negócio: os ramos fora da meta (classifyRamo === 'excluded') também ficam
// fora do churn, em todos os painéis da aba.
// Com o filtro 'Só evitável' ligado, o cancelamento não evitável (e o endosso dele)
// sai de todos os painéis — base e perda —, como Suspensa e Perda Total.
//   comNaoEvitaveis: ignora o filtro 'Só evitável' (para contar o que ele tirou).
export function getRetData(todas: Linha[], f: FiltrosRetencao, comNaoEvitaveis = false): Linha[] {
  const soEvitavel = f.soEvitavel && !comNaoEvitaveis;
  const col = new Set(f.col), ram = new Set(f.ram), grp = new Set(f.grp), mot = new Set(f.mot), tipos = new Set(f.tipos);
  return todas.filter(r => {
    if (isForaDoChurn(r, soEvitavel)) return false;
    if (col.size > 0 && !col.has(r.colab)) return false;
    if (ram.size > 0 && !ram.has(r.ramo)) return false;
    if (grp.size > 0 && !grp.has(r.grp)) return false;
    if (mot.size > 0 && (r.sit === 'Cancelada' || r.tipo === 'CN' || r.tipo === 'CR') && !mot.has(r.motivo || 'Não informado')) return false;
    if (tipos.size > 0 && !tipos.has(r.tipo)) return false;
    if (!saudeFaturaConta(r, tipos)) return false;
    return true;
  });
}

// ── Opções dos seletores da aba (populateFilters / buildRetColabOptions) ───────
const entre = (d: DataISO, s: DataISO, e: DataISO) => !d || ((!s || d >= s) && (!e || d <= e));
/**
 * Colaborador: produção com início de vigência no período, nos ramos que a aba considera; quem já
 * está marcado (`marcados`, no momento da remontagem) continua na lista. Ramo: sem os fora da meta.
 * Motivo: dos cancelamentos da base inteira.
 */
export function opcoesRetencao(todas: Linha[], p: PeriodoRet, marcadosCol: Iterable<string>): { col: string[]; ram: string[]; grp: string[]; mot: string[] } {
  const uniq = (campo: 'grp' | 'ramo'): string[] => { const s = new Set<string>(); for (const r of todas) if (r[campo]) s.add(r[campo]); return [...s].sort(); };
  const mot = new Set<string>();
  for (const r of todas) if (r.sit === 'Cancelada') { const m = r.motivo || 'Não informado'; if (m) mot.add(m); }
  return {
    col: colabsComProducao(todas, r => classifyRamo(r.ramo) !== 'excluded' && !!r.vig && entre(r.vig, p.s, p.e), marcadosCol),
    ram: uniq('ramo').filter(r => classifyRamo(r) !== 'excluded'),
    grp: uniq('grp'),
    mot: [...mot].sort(),
  };
}

// ── Churn do período ───────────────────────────────────────────────────────────
// Churn = apólices perdidas no período ÷ apólices em vigor em algum dia do período.
//
// Base (denominador): apólices, sem endossos, tipo N/R, que estiveram em vigor entre
// o início e o fim do período — início de vigência até o fim, saída a partir do início.
// A saída é a data de cancelamento para Cancelada e o término de vigência para as demais.
//
// 'Renovada' é a apólice antiga, e a sucessora nasce como linha nova. Quando o término
// da Renovada cai até o fim do período, a sucessora já está na base, e contar as duas
// duplicaria o mesmo contrato. Então a Renovada só entra se o término cair depois do
// fim do período (a sucessora ainda não começou).
//
// Perda (numerador): Cancelada ou Vencida com saída dentro do período. Cancelada ou
// vencida depois do fim do período conta como retida naquele período.
// Suspensa e Perda Total ficam fora dos dois lados, pela mesma regra da taxa de
// renovação da aba Comparativo.
export const SIT_CHURN_PERDA: string[] = [SIT.CANCELADA, SIT.VENCIDA];
export const SIT_CHURN_UNIVERSO: string[] = [SIT.ATIVA, SIT.RENOVADA, SIT.CANCELADA, SIT.VENCIDA];

const noPeriodo = (d: DataISO, p: PeriodoRet) => !!d && (!p.s || d >= p.s) && (!p.e || d <= p.e);

export function isChurnBase(r: Linha, p: PeriodoRet): boolean {
  if (!isApolice(r) || (r.tipo !== 'N' && r.tipo !== 'R') || !SIT_CHURN_UNIVERSO.includes(r.sit)) return false;
  const vig = r.vig, saida = churnSaida(r);
  if (!vig || !saida) return false;
  if (p.e && vig > p.e) return false;   // começou depois do período
  if (p.s && saida < p.s) return false; // já tinha saído antes do período
  if (r.sit === SIT.RENOVADA && (!p.e || saida <= p.e)) return false; // sucessora já está na base
  return true;
}
export function isChurnPerda(r: Linha, p: PeriodoRet): boolean {
  return SIT_CHURN_PERDA.includes(r.sit) && noPeriodo(churnSaida(r), p);
}

export type AcumuladoChurn = {
  nome: string; qtdBase: number; premioBase: number; comBase: number; qtdRetida: number; qtdCancel: number; premioCancel: number;
  comPerdida: number; canceladas: number; premioCanceladas: number; comCanceladas: number; vencidas: number; premioVencido: number;
};
export function newChurnAcc(nome: string): AcumuladoChurn {
  return { nome, qtdBase: 0, premioBase: 0, comBase: 0, qtdRetida: 0, qtdCancel: 0, premioCancel: 0, comPerdida: 0, canceladas: 0, premioCanceladas: 0, comCanceladas: 0, vencidas: 0, premioVencido: 0 };
}
export function accChurn(a: AcumuladoChurn, r: Linha, p: PeriodoRet): void {
  if (!isChurnBase(r, p)) return;
  a.qtdBase++; a.premioBase += r.premio; a.comBase += r.com;
  if (!isChurnPerda(r, p)) { a.qtdRetida++; return; }
  a.qtdCancel++; a.premioCancel += Math.abs(r.premio); a.comPerdida += Math.abs(r.com);
  if (r.sit === SIT.CANCELADA) { a.canceladas++; a.premioCanceladas += Math.abs(r.premio); a.comCanceladas += Math.abs(r.com); }
  else { a.vencidas++; a.premioVencido += r.premio; }
}

export const fmtRetPeriodo = (p: PeriodoRet): string => {
  const br = (d: string) => d.split('-').reverse().join('/');
  if (p.s && p.e) return br(p.s) + ' a ' + br(p.e);
  if (p.s) return 'desde ' + br(p.s);
  if (p.e) return 'até ' + br(p.e);
  return 'todo o histórico';
};

// ── KPIs retenção ──────────────────────────────────────────────────────────────
export type CartaoRet = { rotulo: string; valor: string; sub: string; cor: 'k-blue' | 'k-red' | 'k-amber'; fonte: '16px' | '20px' };
export type BlocoKpisRet = { titulo: string; cartoes: CartaoRet[] };

/** renderRetKPIs. `todas` = ALL (a aba não usa os filtros globais). */
export function kpisRetencao(todas: Linha[], f: FiltrosRetencao, p: PeriodoRet): { badge: string; blocos: BlocoKpisRet[]; acumulado: AcumuladoChurn } {
  const data = getRetData(todas, f);
  const a = newChurnAcc('total');
  data.forEach(r => accChurn(a, r, p));
  const pctChurnQtd = a.qtdBase > 0 ? a.qtdCancel / a.qtdBase : 0;
  const pctChurnPremio = a.premioBase > 0 ? a.premioCancel / a.premioBase : 0;
  const pctChurnCom = a.comBase > 0 ? a.comPerdida / a.comBase : 0;
  // Só cancelamento na vigência: mesma base, sem as não renovadas no numerador
  const pctCancQtd = a.qtdBase > 0 ? a.canceladas / a.qtdBase : 0;
  const pctCancPremio = a.premioBase > 0 ? a.premioCanceladas / a.premioBase : 0;
  const pctCancCom = a.comBase > 0 ? a.comCanceladas / a.comBase : 0;

  // Com 'Só evitável', o card de churn mostra também a taxa com todos os motivos
  // As perdidas abertas nos dois tipos: sem isso, o card parece dividir só as canceladas
  const perdidasTxt = fN(a.qtdCancel) + ' perdidas (' + fN(a.canceladas) + ' canc. + ' + fN(a.vencidas) + ' não renov.)';
  let subChurn = perdidasTxt;
  if (f.soEvitavel) {
    const t = newChurnAcc('todos');
    let foraMotivo = 0, foraTroca = 0;
    getRetData(todas, f, true).forEach(r => {
      accChurn(t, r, p);
      if (r.sit !== SIT.CANCELADA || !isChurnBase(r, p) || !isChurnPerda(r, p) || !isCancelNaoEvitavel(r)) return;
      if (isMotivoNaoEvitavel(r)) foraMotivo++; else foraTroca++;
    });
    subChurn = perdidasTxt + ' · ' + fP(t.qtdBase > 0 ? t.qtdCancel / t.qtdBase : 0)
      + ' com todos (fora: ' + fN(foraMotivo) + ' pelo motivo, ' + fN(foraTroca) + ' trocas de seguradora)';
  }

  // Três linhas: a base, o churn total (canceladas + não renovadas) e o churn só de
  // cancelamento na vigência. As duas taxas usam a mesma base, só muda o numerador.
  const blocos: { t: string; cards: { l: string; v: string; s: string; c: CartaoRet['cor'] }[] }[] = [
    { t: 'Base do período', cards: [
      { l: 'Apólices na base', v: fN(a.qtdBase), s: 'em vigor no período · ' + fN(a.qtdRetida) + ' retidas', c: 'k-blue' },
      { l: 'Prêmio na base', v: fBRL(a.premioBase), s: 'apólices, sem endossos', c: 'k-blue' },
      { l: 'Comissão na base', v: fBRL(a.comBase), s: 'apólices, sem endossos', c: 'k-blue' },
    ] },
    { t: 'Churn total — canceladas + não renovadas', cards: [
      { l: 'Churn — Itens', v: fP(pctChurnQtd), s: subChurn, c: 'k-red' },
      { l: 'Churn — Prêmio', v: fP(pctChurnPremio), s: fBRL(a.premioCancel) + ' perdido', c: 'k-red' },
      { l: 'Churn — Comissão', v: fP(pctChurnCom), s: fBRL(a.comPerdida) + ' perdida', c: 'k-red' },
      { l: 'Não renovadas no período', v: fN(a.vencidas), s: fBRL(a.premioVencido) + ' em prêmio', c: 'k-amber' },
    ] },
    { t: 'Churn só cancelamento — canceladas durante a vigência', cards: [
      { l: 'Cancelamento — Itens', v: fP(pctCancQtd), s: fN(a.canceladas) + ' canceladas no período', c: 'k-red' },
      { l: 'Cancelamento — Prêmio', v: fP(pctCancPremio), s: fBRL(a.premioCanceladas) + ' cancelado', c: 'k-red' },
      { l: 'Cancelamento — Comissão', v: fP(pctCancCom), s: fBRL(a.comCanceladas) + ' cancelada', c: 'k-red' },
    ] },
  ];
  return {
    badge: fmtRetPeriodo(p) + (f.soEvitavel ? ' · só evitável' : ''),
    blocos: blocos.map(bl => ({ titulo: bl.t, cartoes: bl.cards.map(k => ({ rotulo: k.l, valor: k.v, sub: k.s, cor: k.c, fonte: k.v.length > 9 ? '16px' as const : '20px' as const })) })),
    acumulado: a,
  };
}

// ── Gráficos retenção ──────────────────────────────────────────────────────────
export type GraficosRet = {
  badgeCancel: string; alturaCancel: number;
  /** null = sem motivos (o antigo destrói o gráfico e deixa o canvas vazio). */
  cancel: { labels: string[]; data: number[]; cores: string[] } | null;
  evolucao: { labels: string[]; canceladas: number[]; vencidas: number[] };
};
const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** renderRetCharts. As mesmas perdas dos KPIs e do detalhe: só apólices da base, perdidas no período. */
export function graficosRetencao(todas: Linha[], f: FiltrosRetencao, p: PeriodoRet, hoje: DataISO): GraficosRet {
  const perdas = getRetData(todas, f).filter(r => isChurnBase(r, p) && isChurnPerda(r, p));
  const canceladas = perdas.filter(r => r.sit === SIT.CANCELADA);
  const vencidas = perdas.filter(r => r.sit === SIT.VENCIDA);

  // Gráfico 1: motivos cancelamento
  const mot: Record<string, number> = {}; canceladas.forEach(r => { const m = r.motivo || 'Não informado'; mot[m] = (mot[m] || 0) + 1; });
  const motSorted = Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const h1 = Math.max(180, motSorted.length * 36 + 50);

  // Gráfico 2: evolução mensal cancelamentos vs vencimentos, pelo mês da saída.
  // Eixo em ano-mês, do início ao fim do período (lado vazio = primeira/última perda),
  // para um período de mais de 12 meses não somar jan/2025 com jan/2026.
  const byCan: Record<string, number> = {}, byVen: Record<string, number> = {};
  canceladas.forEach(r => { const m = churnSaida(r).slice(0, 7); byCan[m] = (byCan[m] || 0) + 1; });
  vencidas.forEach(r => { const m = churnSaida(r).slice(0, 7); byVen[m] = (byVen[m] || 0) + 1; });
  const mesesPerda = perdas.map(r => churnSaida(r).slice(0, 7)).sort();
  const mIni = (p.s || mesesPerda[0] || hoje).slice(0, 7);
  const mFim = (p.e || mesesPerda[mesesPerda.length - 1] || hoje).slice(0, 7);
  const months: string[] = [];
  for (let [y, m] = mIni.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= mFim; m === 12 ? (y++, m = 1) : m++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return {
    badgeCancel: fN(canceladas.length) + ' cancelamentos',
    alturaCancel: h1,
    cancel: motSorted.length ? {
      labels: motSorted.map(m => m[0].length > 35 ? m[0].slice(0, 32) + '...' : m[0]),
      data: motSorted.map(m => m[1]),
      cores: motSorted.map((_, i) => i === 0 ? 'rgba(226,75,74,.85)' : i <= 2 ? 'rgba(226,75,74,.6)' : 'rgba(226,75,74,.4)'),
    } : null,
    evolucao: {
      labels: months.map(k => MES_ABREV[Number(k.slice(5, 7)) - 1] + '/' + k.slice(2, 4)),
      canceladas: months.map(m => byCan[m] || 0),
      vencidas: months.map(m => byVen[m] || 0),
    },
  };
}

// ── Tabela churn por produtor ──────────────────────────────────────────────────
/** getMetric('vt-ret') === 'grp' ? 'grp' : 'colab' */
export type VisaoRet = 'colab' | 'grp';
export type OrdemRet = { chave: string; dir: 'asc' | 'desc' };
/** Valores iniciais do topo do main.js: retSortKey = 'pctQtd', retSortDir = 'desc'. */
export const ORDEM_RET_INICIAL: OrdemRet = { chave: 'pctQtd', dir: 'desc' };

/** setRetSort: mesma coluna inverte; coluna nova começa em desc. */
export function alternarOrdemRet(o: OrdemRet, chave: string): OrdemRet {
  return o.chave === chave ? { chave, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { chave, dir: 'desc' };
}

type LinhaChurn = AcumuladoChurn & { pctQtd: number; pctPremio: number; pctCom: number; pctCanc: number };

/** Agrega por produtor — mesma regra dos KPIs (ver accChurn). */
function agregarPorProdutor(data: Linha[], p: PeriodoRet, visao: VisaoRet): AcumuladoChurn[] {
  const map: Record<string, AcumuladoChurn> = {};
  data.forEach(r => {
    const k = r[visao] || 'Sem identificação';
    if (!map[k]) map[k] = newChurnAcc(k);
    accChurn(map[k], r, p);
  });
  return Object.values(map).filter(v => v.qtdBase > 0);
}

export const classeChurn = (pct: number): 'churn-badge-red' | 'churn-badge-amber' | 'churn-badge-green' =>
  pct >= 0.15 ? 'churn-badge-red' : pct >= 0.05 ? 'churn-badge-amber' : 'churn-badge-green';
export type BadgeChurn = { classe: ReturnType<typeof classeChurn>; texto: string };
/** churnBadge */
export const badgeChurn = (pct: number): BadgeChurn => ({ classe: classeChurn(pct), texto: fP(pct) });

export type ChaveOrdemRet = 'nome' | 'qtdBase' | 'qtdCancel' | 'pctQtd' | 'premioBase' | 'premioCancel' | 'pctPremio' | 'comPerdida' | 'pctCom' | 'canceladas' | 'pctCanc' | 'vencidas';
export type TabelaChurn = {
  badge: string;
  cabecalhos: { chave: ChaveOrdemRet; rotulo: string; alinhar: 'left' | 'right'; classe: '' | 'sort-asc' | 'sort-desc' }[];
  linhas: {
    nome: string; nomeCompleto: string; qtdBase: string; qtdCancel: string; pctQtd: BadgeChurn; premioBase: string; premioCancel: string;
    pctPremio: BadgeChurn; comPerdida: string; pctCom: BadgeChurn; canceladas: string; pctCanc: BadgeChurn; vencidas: string;
  }[];
  total: {
    qtdBase: string; qtdCancel: string; pctQtd: BadgeChurn; premioBase: string; premioCancel: string; pctPremio: BadgeChurn;
    comPerdida: string; pctCom: BadgeChurn; canceladas: string; pctCanc: BadgeChurn; vencidas: string;
  };
};

/** renderRetProdTable. */
export function tabelaChurn(todas: Linha[], f: FiltrosRetencao, p: PeriodoRet, visao: VisaoRet, ordem: OrdemRet): TabelaChurn {
  const label = visao === 'grp' ? 'Grupo' : 'Colaborador';
  const rows: LinhaChurn[] = agregarPorProdutor(getRetData(todas, f), p, visao).map(v => ({
    ...v,
    pctQtd: v.qtdBase > 0 ? v.qtdCancel / v.qtdBase : 0,
    pctPremio: v.premioBase > 0 ? v.premioCancel / v.premioBase : 0,
    pctCom: v.comBase > 0 ? v.comPerdida / v.comBase : 0,
    pctCanc: v.qtdBase > 0 ? v.canceladas / v.qtdBase : 0,
  }));

  // Sort
  const { chave, dir } = ordem;
  rows.sort((a, b) => {
    const va = (a as unknown as Record<string, string | number | undefined>)[chave] ?? 0, vb = (b as unknown as Record<string, string | number | undefined>)[chave] ?? 0;
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const cls = (k: string) => (k === chave ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '') as '' | 'sort-asc' | 'sort-desc';
  const th = (k: ChaveOrdemRet, rotulo: string, alinhar: 'left' | 'right' = 'right') => ({ chave: k, rotulo, alinhar, classe: cls(k) });
  const tot = (g: (r: LinhaChurn) => number) => rows.reduce((s, r) => s + g(r), 0);
  const totQtdBase = tot(r => r.qtdBase), totQtdCancel = tot(r => r.qtdCancel);
  const totPremioBase = tot(r => r.premioBase), totPremioCancel = tot(r => r.premioCancel);
  const totComBase = tot(r => r.comBase), totComPerdida = tot(r => r.comPerdida);
  const totVenc = tot(r => r.vencidas), totCanc = tot(r => r.canceladas);

  return {
    // 'colaborador' + 's' → "colaboradors": rótulo do antigo, reproduzido.
    badge: rows.length + ' ' + label.toLowerCase() + 's',
    cabecalhos: [
      th('nome', label, 'left'), th('qtdBase', 'Base (apólices)'), th('qtdCancel', 'Perdidas'), th('pctQtd', '% Churn itens'),
      th('premioBase', 'Prêmio base', 'right'), th('premioCancel', 'Prêmio perdido', 'right'), th('pctPremio', '% Churn prêmio'),
      th('comPerdida', 'Comissão perdida', 'right'), th('pctCom', '% Churn comissão'), th('canceladas', 'Canceladas'),
      th('pctCanc', '% Só cancel.'), th('vencidas', 'Vencidas'),
    ],
    linhas: rows.map(r => ({
      nome: r.nome.split(' - ')[0].split('|')[0].trim(), nomeCompleto: r.nome,
      qtdBase: fN(r.qtdBase), qtdCancel: fN(r.qtdCancel), pctQtd: badgeChurn(r.pctQtd),
      premioBase: fBRL(r.premioBase), premioCancel: fBRL(r.premioCancel), pctPremio: badgeChurn(r.pctPremio),
      comPerdida: fBRL(r.comPerdida), pctCom: badgeChurn(r.pctCom),
      canceladas: fN(r.canceladas), pctCanc: badgeChurn(r.pctCanc), vencidas: fN(r.vencidas),
    })),
    total: {
      qtdBase: fN(totQtdBase), qtdCancel: fN(totQtdCancel), pctQtd: badgeChurn(totQtdBase > 0 ? totQtdCancel / totQtdBase : 0),
      premioBase: fBRL(totPremioBase), premioCancel: fBRL(totPremioCancel), pctPremio: badgeChurn(totPremioBase > 0 ? totPremioCancel / totPremioBase : 0),
      comPerdida: fBRL(totComPerdida), pctCom: badgeChurn(totComBase > 0 ? totComPerdida / totComBase : 0),
      canceladas: fN(totCanc), pctCanc: badgeChurn(totQtdBase > 0 ? totCanc / totQtdBase : 0), vencidas: fN(totVenc),
    },
  };
}

// ── Tabela detalhe apólice a apólice ──────────────────────────────────────────
export const RET_DETAIL_PAGE_SIZE = 50;
/** retDetailFilter: '' (Todas), 'Cancelada' ou 'Vencida'. */
export type FiltroDetalhe = '' | 'Cancelada' | 'Vencida';

// As mesmas apólices que o KPI conta como perdidas (isChurnBase + isChurnPerda), para
// o total do detalhe bater com "X perdidas no período". Filtro: todas, só canceladas
// ou só vencidas. Ordenado pelo maior prêmio.
export function getRetDetailRows(todas: Linha[], f: FiltrosRetencao, p: PeriodoRet, situacao: FiltroDetalhe): Linha[] {
  return getRetData(todas, f)
    .filter(r => isChurnBase(r, p) && isChurnPerda(r, p) && (!situacao || r.sit === situacao))
    .sort((a, b) => Math.abs(b.premio || 0) - Math.abs(a.premio || 0));
}

const shortSeg = (n: string) => n.replace(' CIA DE SEGUROS GERAIS S/A', '').replace(' CIA NAC DE SEGUROS S/A', '').replace(' SEGUROS S/A', '').replace(' SEGURADORA S/A', '').replace(' SEGURADORA', '').replace(' SEGS CORPORATIVOS SA', '').trim();
const TIPO_LABELS_D: Record<string, string> = { R: 'Renovação', N: 'Novo' };
const SIT_BADGE_CLS: Record<string, string> = {
  [SIT.ATIVA]: 'sit-badge-ativa', [SIT.RENOVADA]: 'sit-badge-renovada',
  [SIT.VENCIDA]: 'sit-badge-vencida', [SIT.CANCELADA]: 'sit-badge-cancelada',
  [SIT.SUSPENSA]: 'sit-badge-suspensa', [SIT.PERDA_TOTAL]: 'sit-badge-perda-total',
};

export type TabelaDetalhe = {
  badge: string; total: number; pagina: number; totalPaginas: number; inicio: number; naPagina: number;
  linhas: {
    tipo: string; cli: string; ramo: string; seg: string; colab: string; sit: string; classeSit: string | null;
    motivo: string; premio: string; com: string; vig: string; saida: string;
  }[];
};

/** renderRetDetailTable. `pagina` é retDetailPage (limitada a 1..totalPaginas, como no antigo). */
export function tabelaDetalhe(rows: Linha[], pagina: number): TabelaDetalhe {
  const totalPages = Math.max(1, Math.ceil(rows.length / RET_DETAIL_PAGE_SIZE));
  const pg = Math.min(Math.max(1, pagina), totalPages);
  const start = (pg - 1) * RET_DETAIL_PAGE_SIZE;
  const page = rows.slice(start, start + RET_DETAIL_PAGE_SIZE);
  return {
    badge: fN(rows.length) + ' perdidas', total: rows.length, pagina: pg, totalPaginas: totalPages, inicio: start, naPagina: page.length,
    linhas: page.map(r => ({
      tipo: TIPO_LABELS_D[r.tipo] || r.tipo, cli: r.cli,
      ramo: r.ramo.toLowerCase().replace(/^\w/, c => c.toUpperCase()), seg: shortSeg(r.seg), colab: r.colab.split(' - ')[0].trim(),
      sit: r.sit, classeSit: SIT_BADGE_CLS[r.sit] ?? null,
      motivo: r.sit === SIT.CANCELADA ? (r.motivo || 'Não informado') : '—',
      premio: fBRL(r.premio), com: fBRL(r.com), vig: r.vig ? r.vig : '—', saida: churnSaida(r) || '—',
    })),
  };
}

// ── Exportações (exportData 'churn' e 'detalhe') ──────────────────────────────
type Celula = string | number | boolean;

/** Planilha "Churn" de Export_Churn.xlsx: mesma agregação da tabela, sem a ordenação. */
export function exportacaoChurn(todas: Linha[], f: FiltrosRetencao, p: PeriodoRet, visao: VisaoRet): Record<string, Celula>[] {
  return agregarPorProdutor(getRetData(todas, f), p, visao).map(v => ({
    'Período': fmtRetPeriodo(p),
    'Churn': f.soEvitavel ? 'Só evitável' : 'Todos os motivos',
    'Nome': v.nome,
    'Base (apólices)': v.qtdBase,
    'Retidas': v.qtdRetida,
    'Perdidas (canc+venc)': v.qtdCancel,
    'Canceladas': v.canceladas,
    '% Churn itens': v.qtdBase > 0 ? (v.qtdCancel / v.qtdBase) : 0,
    'Prêmio base': v.premioBase,
    'Prêmio perdido': v.premioCancel,
    '% Churn prêmio': v.premioBase > 0 ? (v.premioCancel / v.premioBase) : 0,
    'Comissão perdida': v.comPerdida,
    '% Churn comissão': v.comBase > 0 ? (v.comPerdida / v.comBase) : 0,
    '% Só cancelamento (itens)': v.qtdBase > 0 ? (v.canceladas / v.qtdBase) : 0,
    '% Só cancelamento (prêmio)': v.premioBase > 0 ? (v.premioCanceladas / v.premioBase) : 0,
    '% Só cancelamento (comissão)': v.comBase > 0 ? (v.comCanceladas / v.comBase) : 0,
    'Vencidas': v.vencidas,
  }));
}

/** Planilha "Detalhe" de Export_Detalhe.xlsx: todas as perdidas (sem paginação), no filtro de situação atual. */
export function exportacaoDetalhe(rows: Linha[]): Record<string, Celula>[] {
  return rows.map(r => ({
    'Tipo': r.tipo === 'N' ? 'Novo' : 'Renovação',
    'Cliente': r.cli,
    'Ramo': r.ramo,
    'Seguradora': r.seg,
    'Colaborador': r.colab,
    'Situação': r.sit,
    'Motivo': r.sit === SIT.CANCELADA ? (r.motivo || 'Não informado') : '-',
    'Prêmio': r.premio,
    'Comissão': r.com,
    'Vigência': r.vig ? r.vig : '-',
    'Saída': churnSaida(r) || '-',
  }));
}
