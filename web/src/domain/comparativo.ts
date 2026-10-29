// Aba Comparativo de períodos (main.js 2923–3665): cálculos puros, sem DOM. Regras de negócio em METRICAS.md
// (§2 taxa de renovação, §3 churn do Comparativo, §4 filtros globais); o main.js é a referência.
import type { DataISO, Linha } from './tipos';
import type { FiltrosGlobais } from './filtros';
import { fBRL, fN } from './formatos';
import { SIT, SIT_DESFECHO_RENOVACAO, isApolice } from './situacoes';
import { saudeFaturaConta } from './saude/aplicar';
import { classifyRamo } from './ramos';
import { isForaDoChurn } from './retencao';

export const TIPOS_PROD = ['N', 'R', 'ER', 'EN'];

// O app antigo agrupa por ano/mês com getFullYear()/getMonth() (data LOCAL do Date), e não pela fatia UTC do
// fmtD: ver Linha.vigLocal (só presente quando difere de vig).
const vigLocalDe = (r: Linha): DataISO => r.vigLocal || r.vig;

// ── Datas do período ──────────────────────────────────────────────────────────
const iso = (a: number, m: number, d: number): DataISO => new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10);
const partes = (d: DataISO): [number, number, number] => { const [a, m, dia] = d.split('-').map(Number); return [a, m - 1, dia]; };

/** prevYearDates: mesma data, um ano antes (29/02 vira 01/03, como o setFullYear do Date). */
export function prevYearDates(start: DataISO, end: DataISO): { start: DataISO; end: DataISO } {
  const [sa, sm, sd] = partes(start), [ea, em, ed] = partes(end);
  return { start: iso(sa - 1, sm, sd), end: iso(ea - 1, em, ed) };
}

// Desloca o range de emissão 1 ano para trás (mesma regra da vigência), preservando
// pontas vazias — prevYearDates não aceita string vazia, então só chamamos por lado preenchido.
export function shiftEmissaoRangeToPrevYear(es: DataISO, ee: DataISO): { start: DataISO; end: DataISO } {
  if (es && ee) return prevYearDates(es, ee);
  if (es) return { start: prevYearDates(es, es).start, end: '' };
  if (ee) return { start: '', end: prevYearDates(ee, ee).end };
  return { start: '', end: '' };
}

/** toLocaleDateString('pt-BR') de uma data civil: dd/mm/aaaa. */
export const fmtLabel = (d: DataISO): string => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };

export type PeriodoManual = { start: DataISO; end: DataISO };
export type PeriodoComp = { start: DataISO; end: DataISO; seguindoGlobal: boolean };

/**
 * Precedência do período: override manual da aba > vigência global (se ambas as pontas estiverem preenchidas)
 * > default (1º de janeiro do ano corrente até hoje).
 */
export function periodoComp(manual: PeriodoManual | null, f: Pick<FiltrosGlobais, 'vigIni' | 'vigFim'>, hoje: DataISO): PeriodoComp {
  const manualValido = !!(manual && manual.start && manual.end);
  const seguindoGlobal = !manualValido && !!(f.vigIni && f.vigFim);
  if (manual && manualValido) return { start: manual.start, end: manual.end, seguindoGlobal };
  if (f.vigIni && f.vigFim) return { start: f.vigIni, end: f.vigFim, seguindoGlobal };
  return { start: `${hoje.slice(0, 4)}-01-01`, end: hoje, seguindoGlobal };
}

/** Período default da aba (initDashboard: 1º de janeiro do ano corrente → hoje). */
export const periodoPadraoComp = (hoje: DataISO): PeriodoManual => ({ start: `${hoje.slice(0, 4)}-01-01`, end: hoje });

export function tagsPeriodo(p: { start: DataISO; end: DataISO }, prev: { start: DataISO; end: DataISO }): { atual: string; anterior: string } {
  return {
    atual: `Atual: ${fmtLabel(p.start)} → ${fmtLabel(p.end)}`,
    anterior: `Anterior: ${fmtLabel(prev.start)} → ${fmtLabel(prev.end)}`,
  };
}

// ── Escopo global do topo ─────────────────────────────────────────────────────
export type Escopo = (r: Linha, emStart: DataISO, emEnd: DataISO) => boolean;

// Escopo global do topo (colaborador, grupo, ramo, seguradora, tipo, emissão), sem
// recorte de vigência — quem chama decide a âncora temporal. getCompData ancora em
// 'vig'; a safra de renovação ancora em 'fim'.
export function criarEscopo(f: FiltrosGlobais): Escopo {
  const col = new Set(f.col), grp = new Set(f.grp), ram = new Set(f.ram), seg = new Set(f.seg), tipos = new Set(f.tipos);
  return (r, emStart, emEnd) => {
    if (emStart && r.em && r.em < emStart) return false;
    if (emEnd && r.em && r.em > emEnd) return false;
    if (col.size > 0 && !col.has(r.colab)) return false;
    if (grp.size > 0 && !grp.has(r.grp)) return false;
    if (ram.size > 0 && !ram.has(r.ramo)) return false;
    if (seg.size > 0 && !seg.has(r.seg)) return false;
    if (tipos.size > 0 && !tipos.has(r.tipo)) return false;
    if (!saudeFaturaConta(r, tipos)) return false;
    return true;
  };
}

export function getCompData(todas: Linha[], escopo: Escopo, start: DataISO, end: DataISO, emStart: DataISO, emEnd: DataISO): Linha[] {
  return todas.filter(r => {
    if (start && r.vig && r.vig < start) return false;
    if (end && r.vig && r.vig > end) return false;
    return escopo(r, emStart, emEnd);
  });
}

// Safra "a renovar" do período: apólices (não endossos) de negócio novo ou renovação
// cujo TÉRMINO DE VIGÊNCIA cai no período e que já chegaram a um desfecho — renovou
// (Renovada) ou não voltou (Vencida).
//
// Âncora em 'fim', não em 'vig': a pergunta é "o que venceu neste período", diferente
// do resto da aba. Canceladas/Suspensas/Perda Total ficam fora porque saíram no meio
// da vigência, então nunca foram candidatas a renovar — incluí-las diluiria a taxa
// com perdas que não são falha de renovação.
export function getCompSafraData(todas: Linha[], escopo: Escopo, start: DataISO, end: DataISO, emStart: DataISO, emEnd: DataISO): Linha[] {
  return todas.filter(r => {
    if (!r.fim) return false;
    const fim = r.fim;
    if (start && fim < start) return false;
    if (end && fim > end) return false;
    if (r.tipo !== 'N' && r.tipo !== 'R') return false;
    if (!isApolice(r)) return false;
    if (!SIT_DESFECHO_RENOVACAO.includes(r.sit)) return false;
    return escopo(r, emStart, emEnd);
  });
}

export type DadosComp = {
  start: DataISO; end: DataISO; prev: { start: DataISO; end: DataISO }; emPrev: { start: DataISO; end: DataISO };
  atual: Linha[]; anterior: Linha[];
};

/** Os dois recortes comparados (período e o mesmo período do ano anterior) com as emissões deslocadas. */
export function dadosComp(todas: Linha[], f: FiltrosGlobais, p: { start: DataISO; end: DataISO }): DadosComp {
  const escopo = criarEscopo(f);
  const prev = prevYearDates(p.start, p.end);
  const emPrev = shiftEmissaoRangeToPrevYear(f.emIni, f.emFim);
  return {
    start: p.start, end: p.end, prev, emPrev,
    atual: getCompData(todas, escopo, p.start, p.end, f.emIni, f.emFim),
    anterior: getCompData(todas, escopo, prev.start, prev.end, emPrev.start, emPrev.end),
  };
}

// ── Chips de escopo ───────────────────────────────────────────────────────────
// Chips que resumem, na própria aba, quais filtros globais do topo estão recortando o comparativo.
export type ChipsComp = { chips: string[]; neutro: boolean };
export function chipsEscopo(f: FiltrosGlobais, manualAtivo: boolean, seguindoGlobal: boolean): ChipsComp {
  const msChip = (l: string[], plural: string) => l.length === 0 ? null : (l.length === 1 ? l[0] : `${l.length} ${plural}`);
  const chips = [
    msChip(f.col, 'colaboradores'), msChip(f.grp, 'grupos'), msChip(f.ram, 'ramos'), msChip(f.seg, 'seguradoras'),
  ].filter((c): c is string => !!c);
  if (f.tipos.length > 0) chips.push(`Tipo: ${f.tipos.join(', ')}`);
  const es = f.emIni, ee = f.emFim;
  if (es && ee) chips.push(`Emissão: ${fmtLabel(es)} → ${fmtLabel(ee)}`);
  else if (es) chips.push(`Emissão: ${fmtLabel(es)} → —`);
  else if (ee) chips.push(`Emissão: — → ${fmtLabel(ee)}`);
  // O chip de período só aparece quando há de fato uma origem a explicar — no default
  // (1º/jan → hoje) não há filtro nenhum por trás dele, então omitimos.
  if (manualAtivo) chips.unshift('Período: definido na aba');
  else if (seguindoGlobal) chips.unshift('Período: seguindo filtro global');
  if (chips.length === 0) return { chips: ['Sem filtros globais — carteira completa'], neutro: true };
  return { chips, neutro: false };
}

// ── Gráfico mensal ────────────────────────────────────────────────────────────
export type MetricaComp = 'premio_novo' | 'premio_total' | 'com_nova' | 'com_total' | 'qtd_nova' | 'qtd_total';
export const METRICAS_COMP: { valor: MetricaComp; id: string; rotulo: string }[] = [
  { valor: 'premio_novo', id: 'cm-pn', rotulo: 'Prêmio Novo' },
  { valor: 'premio_total', id: 'cm-pt', rotulo: 'Prêmio Total' },
  { valor: 'com_nova', id: 'cm-cn', rotulo: 'Com. Nova' },
  { valor: 'com_total', id: 'cm-ct', rotulo: 'Com. Total' },
  { valor: 'qtd_nova', id: 'cm-qn', rotulo: 'Qtd Nova' },
  { valor: 'qtd_total', id: 'cm-qt', rotulo: 'Qtd Total' },
];
export const METRICA_COMP_INICIAL: MetricaComp = 'premio_novo';

const ML = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function getMonthsInRange(start: DataISO, end: DataISO): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  let [a, m] = partes(start);
  // cur (1º do mês) <= e (fim, 00:00 local)
  const dois = (n: number) => String(n).padStart(2, '0');
  while (`${a}-${dois(m + 1)}-01` <= end) {
    months.push({ key: `${a}-${dois(m + 1)}`, label: ML[m] + '/' + String(a).slice(2) });
    m++;
    if (m > 11) { m = 0; a++; }
  }
  return months;
}

export function compAggByMonth(data: Linha[], metric: MetricaComp): Record<string, number> {
  let filtered: Linha[], isCount = false, field: 'premio' | 'com' = 'premio';
  if (metric === 'premio_novo') { filtered = data.filter(r => r.tipo === 'N'); field = 'premio'; }
  else if (metric === 'premio_total') { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); field = 'premio'; }
  else if (metric === 'com_nova') { filtered = data.filter(r => r.tipo === 'N'); field = 'com'; }
  else if (metric === 'com_total') { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); field = 'com'; }
  else if (metric === 'qtd_nova') { filtered = data.filter(r => r.tipo === 'N'); isCount = true; }
  else { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); isCount = true; }
  const byMonth: Record<string, number> = {};
  filtered.forEach(r => {
    if (!r.vig) return;
    const key = vigLocalDe(r).slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + (isCount ? 1 : r[field]);
  });
  return byMonth;
}

export const ROTULOS_METRICA_COMP: Record<MetricaComp, string> = {
  premio_novo: 'Prêmio Novo', premio_total: 'Prêmio Total',
  com_nova: 'Comissão Nova', com_total: 'Comissão Total',
  qtd_nova: 'Qtd Nova', qtd_total: 'Qtd Total',
};

export type GraficoComp = {
  labels: string[]; valA: number[]; valP: number[]; varPct: number[]; isMoney: boolean; rotulo: string;
};

export function graficoComp(d: DadosComp, metrica: MetricaComp): GraficoComp {
  const monthsA = getMonthsInRange(d.start, d.end);
  const monthsP = getMonthsInRange(d.prev.start, d.prev.end);
  const byMonthA = compAggByMonth(d.atual, metrica);
  const byMonthP = compAggByMonth(d.anterior, metrica);
  const valA = monthsA.map(m => byMonthA[m.key] || 0);
  const valP = monthsP.map(m => byMonthP[m.key] || 0);
  const len = Math.max(valA.length, valP.length);
  while (valA.length < len) valA.push(0);
  while (valP.length < len) valP.push(0);
  const labels = monthsA.map(m => m.label);
  while (labels.length < len) labels.push('?');
  const varPct = valA.map((a, i) => {
    const p = valP[i] || 0;
    if (p === 0) return a > 0 ? 100 : 0;
    return ((a - p) / p) * 100;
  });
  const isMoney = ['premio_novo', 'premio_total', 'com_nova', 'com_total'].includes(metrica);
  return { labels, valA, valP, varPct, isMoney, rotulo: ROTULOS_METRICA_COMP[metrica] };
}

// ── Gráfico agrupado (trimestre / semestre / ano) ──────────────────────────────
// Recurso do app novo (o antigo só tinha mês × mesmo mês do ano anterior, que segue idêntico em 'mes' + 'ano').
// Agrupado, só entram períodos FECHADOS e inteiros dentro do intervalo: o trimestre em andamento
// compararia meses incompletos com um trimestre cheio.
export type Agrupamento = 'mes' | 'trimestre' | 'semestre' | 'ano';
export type BaseComparacao = 'ano' | 'anterior';
export const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Mês' }, { valor: 'trimestre', rotulo: 'Trimestre' }, { valor: 'semestre', rotulo: 'Semestre' }, { valor: 'ano', rotulo: 'Ano' },
];
export const BASES_COMPARACAO: { valor: BaseComparacao; rotulo: string }[] = [
  { valor: 'ano', rotulo: 'Mesmo período do ano anterior' }, { valor: 'anterior', rotulo: 'Período imediatamente anterior' },
];
const MESES_POR: Record<Exclude<Agrupamento, 'mes'>, number> = { trimestre: 3, semestre: 6, ano: 12 };
const chaveMes = (a: number, m0: number) => `${a}-${String(m0 + 1).padStart(2, '0')}`;
const ultimoDia = (a: number, m0: number) => new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate();

/** Meses (chaves 'aaaa-mm') de um período que começa em (a, m0) e dura `n` meses, `desloc` meses depois. */
function mesesDe(a: number, m0: number, n: number, desloc = 0): string[] {
  return Array.from({ length: n }, (_, i) => { const t = a * 12 + m0 + desloc + i; return chaveMes(Math.floor(t / 12), t % 12); });
}

export function graficoCompAgrupado(d: DadosComp, metrica: MetricaComp, agrup: Agrupamento, base: BaseComparacao, hoje: DataISO): GraficoComp & { rotuloAnterior: string } {
  const rotuloAnterior = BASES_COMPARACAO.find(b => b.valor === base)!.rotulo;
  if (agrup === 'mes' && base === 'ano') return { ...graficoComp(d, metrica), rotuloAnterior };

  const byA = compAggByMonth(d.atual, metrica), byP = compAggByMonth(d.anterior, metrica);
  const noIntervalo = new Set(getMonthsInRange(d.start, d.end).map(m => m.key));
  // Ano anterior: sempre a base do ano anterior (como o gráfico mensal). Período anterior: o do intervalo quando
  // cai nele, senão a base anterior (o período antes do 1º do intervalo).
  const soma = (chaves: string[], soAnterior: boolean) => chaves.reduce((s, k) => s + ((!soAnterior && noIntervalo.has(k) ? byA[k] : byP[k]) || 0), 0);

  const n = agrup === 'mes' ? 1 : MESES_POR[agrup];
  const periodos: { label: string; meses: string[]; antes: string[] }[] = [];
  const [ai, mi] = [+d.start.slice(0, 4), +d.start.slice(5, 7) - 1];
  for (let t = ai * 12 + Math.floor(mi / n) * n; ; t += n) {
    const a = Math.floor(t / 12), m0 = t % 12;
    const ini = `${chaveMes(a, m0)}-01`;
    const fimM = (t + n - 1) % 12, fimA = Math.floor((t + n - 1) / 12);
    const fim = `${chaveMes(fimA, fimM)}-${String(ultimoDia(fimA, fimM)).padStart(2, '0')}`;
    if (ini > d.end) break;
    if (agrup !== 'mes' && (ini < d.start || fim > d.end || fim >= hoje)) continue;
    const label = agrup === 'mes' ? ML[m0] + '/' + String(a).slice(2)
      : agrup === 'ano' ? String(a)
      : `${agrup === 'trimestre' ? 'T' : 'S'}${m0 / n + 1}/${String(a).slice(2)}`;
    periodos.push({ label, meses: mesesDe(a, m0, n), antes: mesesDe(a, m0, n, base === 'ano' ? -12 : -n) });
  }

  const valA = periodos.map(p => soma(p.meses, false));
  const valP = periodos.map(p => soma(p.antes, base === 'ano'));
  const varPct = valA.map((a, i) => { const p = valP[i] || 0; return p === 0 ? (a > 0 ? 100 : 0) : ((a - p) / p) * 100; });
  const isMoney = ['premio_novo', 'premio_total', 'com_nova', 'com_total'].includes(metrica);
  return { labels: periodos.map(p => p.label), valA, valP, varPct, isMoney, rotulo: ROTULOS_METRICA_COMP[metrica], rotuloAnterior };
}

// ── Churn do Comparativo ──────────────────────────────────────────────────────
// Churn do Comparativo (regra de negócio própria, diferente da aba Retenção):
//   churn = 1 − renovações (R) do período ÷ total (N + R) do mesmo período do ano anterior
// Conta apólices (sem endossos/faturas), em todos os ramos, com os filtros globais.
// Pode ficar negativo quando entram mais renovações do que havia de base — renovação
// de apólice que veio de outra corretora, por exemplo.
export function calcChurnComp(dataAtual: Linha[], dataAnoAnterior: Linha[]): { renov: number; base: number; taxa: number } {
  const renov = dataAtual.filter(r => isApolice(r) && r.tipo === 'R').length;
  const base = dataAnoAnterior.filter(r => isApolice(r) && (r.tipo === 'N' || r.tipo === 'R')).length;
  return { renov, base, taxa: base ? 1 - renov / base : 0 };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
export type CartaoComp = { rotulo: string; titulo: string; trendCls: string; trendTxt: string; valor: string; foot: string };
export type BlocoComp = { titulo: string; cartoes: CartaoComp[] };

const fPct2 = (v: number): string => (v * 100).toFixed(2) + '%';

type KpisPeriodo = {
  premioTotal: number; comTotal: number; apolices: number; clientesUnicos: number; premioNovo: number; premioRenov: number;
  mixNovo: number; ticketMedio: number; comMediaPct: number; premioRisco: number; canceladasQtd: number;
  produtoresAtivos: number; seguradorasAtivas: number; ramosAtivos: number; endossos: number;
};

function calcKPIs(data: Linha[]): KpisPeriodo {
  const prod = data.filter(r => TIPOS_PROD.includes(r.tipo));
  const premioTotal = prod.reduce((s, r) => s + r.premio, 0);
  const comTotal = prod.reduce((s, r) => s + r.com, 0);
  const apolices = prod.length;
  const clientesUnicos = new Set(data.map(r => r.cli).filter(Boolean)).size;

  const premioNovo = data.filter(r => r.tipo === 'N' || r.tipo === 'EN').reduce((s, r) => s + r.premio, 0);
  const premioRenov = data.filter(r => r.tipo === 'R' || r.tipo === 'ER').reduce((s, r) => s + r.premio, 0);
  const mixNovo = premioTotal ? premioNovo / premioTotal : 0;

  const ticketMedio = apolices ? premioTotal / apolices : 0;
  const comMediaPct = premioTotal ? comTotal / premioTotal : 0;
  const canceladas = data.filter(r => r.sit === 'Cancelada');
  const premioRisco = canceladas.reduce((s, r) => s + Math.abs(r.premio), 0);

  const produtoresAtivos = new Set(prod.map(r => r.colab).filter(Boolean)).size;
  const seguradorasAtivas = new Set(prod.map(r => r.seg).filter(Boolean)).size;
  const ramosAtivos = new Set(prod.map(r => r.ramo).filter(Boolean)).size;
  const endossos = data.filter(r => r.tipo === 'EN' || r.tipo === 'ER').length;

  return {
    premioTotal, comTotal, apolices, clientesUnicos, premioNovo, premioRenov, mixNovo,
    ticketMedio, comMediaPct, premioRisco, canceladasQtd: canceladas.length,
    produtoresAtivos, seguradorasAtivas, ramosAtivos, endossos,
  };
}

// Aproveitamento da safra que venceu no período: renovou / (renovou + não voltou).
function calcSafra(safra: Linha[]) {
  const renovadas = safra.filter(r => r.sit === SIT.RENOVADA).length;
  const vencidas = safra.filter(r => r.sit === SIT.VENCIDA).length;
  const base = renovadas + vencidas;
  return { renovadas, vencidas, base, taxa: base ? renovadas / base : null as number | null };
}

type OpcoesCartao = {
  lowerIsBetter?: boolean; neutral?: boolean; footExtra?: ((delta: number, deltaTxt: string) => string) | null;
  na?: boolean; naCompare?: boolean; title?: string;
};

// type: 'money' | 'count' | 'pct'. neutral força a cor cinza no badge (usado quando
// "maior" não é nem bom nem ruim, ex. mix novo x renovação), mas mantém seta/valor.
function kpiCard(label: string, vA: number, vP: number, type: 'money' | 'count' | 'pct', opts: OpcoesCartao = {}): CartaoComp {
  const { lowerIsBetter = false, neutral = false, footExtra = null, na = false, naCompare = false, title = '' } = opts;
  const fmt = type === 'money' ? fBRL : type === 'pct' ? fPct2 : fN;
  const delta = vA - vP;
  const deltaTxt = type === 'money' ? (delta >= 0 ? '+' : '−') + fBRL(Math.abs(delta))
    : type === 'pct' ? (delta >= 0 ? '+' : '−') + Math.abs(delta * 100).toFixed(1) + ' p.p.'
    : (delta >= 0 ? '+' : '−') + fN(Math.abs(delta));

  const refZero = vP === 0 && vA === 0;
  const diffRel = vP !== 0 ? ((vA - vP) / Math.abs(vP)) * 100 : (vA > 0 ? 100 : 0);
  const isUp = !refZero && diffRel > 0.1;
  const isDown = !refZero && diffRel < -0.1;
  const isGood = lowerIsBetter ? isDown : isUp;
  const isBad = lowerIsBetter ? isUp : isDown;
  const tCls = neutral ? 'trend-neutral' : (refZero ? 'trend-neutral' : isGood ? 'trend-up' : isBad ? 'trend-down' : 'trend-neutral');
  const arrow = refZero ? '' : isUp ? '▲ ' : isDown ? '▼ ' : '';
  const badgeTxt = !refZero && (isUp || isDown) ? Math.abs(diffRel).toFixed(1) + '%' : '—';

  const foot = footExtra ? footExtra(delta, deltaTxt) : `ant. ${fmt(vP)} · Δ ${deltaTxt}`;

  // 'na' = não há base para calcular no período (ex.: nada venceu). Mostrar 0% aqui
  // mentiria — é ausência de dado, não resultado ruim.
  return {
    rotulo: label, titulo: title,
    trendCls: (na || naCompare) ? 'trend-neutral' : tCls,
    trendTxt: (na || naCompare) ? '—' : arrow + badgeTxt,
    valor: na ? '—' : fmt(vA), foot,
  };
}

/** Dados que o bloco de KPIs precisa além do par atual/anterior: o de dois anos atrás (churn) e as safras. */
export type DadosKpisComp = { prev2: Linha[]; safraAtual: Linha[]; safraPrev: Linha[] };
export function dadosKpisComp(todas: Linha[], f: FiltrosGlobais, d: DadosComp): DadosKpisComp {
  const escopo = criarEscopo(f);
  // Churn do Comparativo compara com o ano anterior, então o card do período anterior
  // precisa do período de dois anos atrás (ver calcChurnComp).
  const prev2 = prevYearDates(d.prev.start, d.prev.end);
  const emPrev2 = shiftEmissaoRangeToPrevYear(d.emPrev.start, d.emPrev.end);
  return {
    prev2: getCompData(todas, escopo, prev2.start, prev2.end, emPrev2.start, emPrev2.end),
    // Safra de renovação: recorte próprio (ancorado no término de vigência), por isso
    // não sai de atual/anterior, que estão filtrados pelo início de vigência.
    safraAtual: getCompSafraData(todas, escopo, d.start, d.end, f.emIni, f.emFim),
    safraPrev: getCompSafraData(todas, escopo, d.prev.start, d.prev.end, d.emPrev.start, d.emPrev.end),
  };
}

/** Opções dos KPIs. `soRamosMeta`:
 *  - taxa de renovação ignora os ramos que não renovam — os mesmos que ficam fora da meta (classifyRamo = 'excluded':
 *    viagem, carta verde, AP, previdência, eventos, transporte…);
 *  - taxa de churn usa a regra "Só evitável" da aba Retenção (isForaDoChurn): sem esses ramos e sem os cancelamentos
 *    não evitáveis (venda do bem, reemissão, erro de emissão, falecimento, perda total, troca de seguradora), tanto
 *    nas renovações do período quanto na base N + R do ano anterior. */
export type OpcoesKpisComp = { soRamosMeta?: boolean };

const soRamosMeta = (l: Linha[]): Linha[] => l.filter(r => classifyRamo(r.ramo) !== 'excluded');
const soChurnEvitavel = (l: Linha[]): Linha[] => l.filter(r => !isForaDoChurn(r, true));

export function kpisComp(d: DadosComp, k: DadosKpisComp, opts: OpcoesKpisComp = {}): BlocoComp[] {
  const soMeta = !!opts.soRamosMeta;
  const ch = soMeta ? soChurnEvitavel : (l: Linha[]) => l;
  const churn = { atual: calcChurnComp(ch(d.atual), ch(d.anterior)), prev: calcChurnComp(ch(d.anterior), ch(k.prev2)) };
  const fA = calcSafra(soMeta ? soRamosMeta(k.safraAtual) : k.safraAtual);
  const fP2 = calcSafra(soMeta ? soRamosMeta(k.safraPrev) : k.safraPrev);
  const sA = calcKPIs(d.atual), sP = calcKPIs(d.anterior);
  return [
    {
      titulo: 'Resultado do período', cartoes: [
        kpiCard('Prêmio total', sA.premioTotal, sP.premioTotal, 'money'),
        kpiCard('Comissão total', sA.comTotal, sP.comTotal, 'money'),
        kpiCard('Apólices', sA.apolices, sP.apolices, 'count'),
        kpiCard('Clientes únicos', sA.clientesUnicos, sP.clientesUnicos, 'count'),
      ],
    },
    {
      titulo: 'Novo × Renovação', cartoes: [
        kpiCard('Prêmio novo', sA.premioNovo, sP.premioNovo, 'money'),
        kpiCard('Prêmio renovação', sA.premioRenov, sP.premioRenov, 'money'),
        // Único card da aba ancorado no TÉRMINO de vigência (o resto usa o início) —
        // daí o tooltip: sem ele o número parece incoerente com os vizinhos.
        kpiCard('Taxa de renovação', fA.taxa || 0, fP2.taxa || 0, 'pct', {
          na: fA.base === 0,
          // Sem base no período anterior não há variação a exibir — o badge viraria
          // "▲ 100%" contra um zero que não existe.
          naCompare: fP2.base === 0,
          title: 'Apólices (sem endossos) de negócio novo ou renovação cujo término de vigência '
            + 'caiu no período: quantas foram Renovadas ÷ (Renovadas + Vencidas). '
            + 'Canceladas, Suspensas e Perda Total ficam fora da base — saíram no meio da '
            + 'vigência, não eram candidatas a renovar. Recorte por término de vigência, '
            + 'diferente dos demais cards, que usam o início.'
            + (soMeta ? ' Só ramos que renovam: os mesmos da meta (sem viagem, carta verde, acidentes pessoais, '
              + 'previdência, eventos aleatórios, transporte nacional e educacional).' : ''),
          footExtra: () => fA.base === 0
            ? 'nada venceu no período'
            : `${fN(fA.renovadas)} renov. · ${fN(fA.vencidas)} venc. · ant. ${fP2.base ? fPct2(fP2.taxa as number) : '—'}`
              + (soMeta ? ' · só ramos da meta' : ''),
        }),
        // "maior" mix novo não é bom nem ruim por si só (depende da estratégia) — cor neutra.
        kpiCard('Mix novo', sA.mixNovo, sP.mixNovo, 'pct', { neutral: true }),
      ],
    },
    {
      titulo: 'Eficiência & risco', cartoes: [
        kpiCard('Ticket médio', sA.ticketMedio, sP.ticketMedio, 'money'),
        kpiCard('Comissão média (%)', sA.comMediaPct, sP.comMediaPct, 'pct'),
        kpiCard('Taxa de churn', churn.atual.taxa, churn.prev.taxa, 'pct', {
          lowerIsBetter: true, naCompare: !churn.prev.base, na: !churn.atual.base,
          title: '1 − renovações (R) do período ÷ apólices N + R do mesmo período do ano anterior. Só apólices, sem endossos.'
            + (soMeta ? ' Só evitável, como na aba Retenção: sem os ramos fora da meta e sem os cancelamentos que a '
              + 'corretora não tinha como evitar (venda do bem, reemissão, erro de emissão, falecimento, perda total, '
              + 'troca de seguradora).' : ''),
          footExtra: () => `${fN(churn.atual.renov)} renov. ÷ ${fN(churn.atual.base)} N+R ano ant. · ant. ${churn.prev.base ? fPct2(churn.prev.taxa) : '—'}`
            + (soMeta ? ' · só evitável' : ''),
        }),
        kpiCard('Prêmio em risco', sA.premioRisco, sP.premioRisco, 'money', {
          lowerIsBetter: true,
          footExtra: (_delta, deltaTxt) => `${fN(sA.canceladasQtd)} canc. · ant. ${fBRL(sP.premioRisco)} · Δ ${deltaTxt}`,
        }),
      ],
    },
    {
      titulo: 'Cobertura', cartoes: [
        kpiCard('Produtores ativos', sA.produtoresAtivos, sP.produtoresAtivos, 'count'),
        kpiCard('Seguradoras ativas', sA.seguradorasAtivas, sP.seguradorasAtivas, 'count'),
        kpiCard('Ramos ativos', sA.ramosAtivos, sP.ramosAtivos, 'count'),
        kpiCard('Endossos (EN + ER)', sA.endossos, sP.endossos, 'count'),
      ],
    },
  ];
}

// ── Comparativo por seguradora e ramo (pivô por ano civil sobre FD) ───────────
// Gráfico, KPIs e esta tabela compartilham os mesmos filtros globais do topo
// (colaborador, grupo, ramo, seguradora, tipo, emissão). A diferença que resta é de
// recorte temporal: a aba compara dois períodos (atual vs. mesmo range do ano
// anterior, deslocado via prevYearDates/shiftEmissaoRangeToPrevYear) — período esse
// que segue a vigência global por padrão mas pode ter sido sobrescrito manualmente
// — enquanto o pivô abaixo agrupa por ano civil usando FD direto.
export type VisaoPivo = 'seg' | 'ramo' | 'ambos';
export type MetricaPivo = 'premio' | 'comissao';
export type NoPivo = { nome: string; valores: Map<number, number>; total: number };
export type SegPivo = NoPivo & { ramos: NoPivo[] };
export type DadosPivo = { years: number[]; seguradoras: SegPivo[]; totalGeral: Map<number, number> };

export function getCompPivotData(fd: Linha[], metricField: 'premio' | 'com'): DadosPivo {
  const anoDe = (r: Linha) => Number(vigLocalDe(r).slice(0, 4));
  const years = [...new Set(fd.filter(r => r.vig).map(anoDe))].sort((a, b) => a - b);
  const seguradoras = new Map<string, { total: Map<number, number>; ramos: Map<string, Map<number, number>> }>();
  const totalGeral = new Map<number, number>(); // ano -> val

  fd.forEach(r => {
    if (!r.vig) return;
    const ano = anoDe(r);
    const val = r[metricField] || 0;
    const seg = r.seg || 'Sem seguradora';
    const ramo = r.ramo || 'Sem ramo';
    if (!seguradoras.has(seg)) seguradoras.set(seg, { total: new Map(), ramos: new Map() });
    const s = seguradoras.get(seg)!;
    s.total.set(ano, (s.total.get(ano) || 0) + val);
    if (!s.ramos.has(ramo)) s.ramos.set(ramo, new Map());
    const rMap = s.ramos.get(ramo)!;
    rMap.set(ano, (rMap.get(ano) || 0) + val);
    totalGeral.set(ano, (totalGeral.get(ano) || 0) + val);
  });

  const somaAnos = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const seguradorasList: SegPivo[] = [...seguradoras.entries()].map(([nome, s]) => ({
    nome,
    valores: s.total,
    total: somaAnos(s.total),
    ramos: [...s.ramos.entries()]
      .map(([ramoNome, ramoMap]) => ({ nome: ramoNome, valores: ramoMap, total: somaAnos(ramoMap) }))
      .sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total);

  return { years, seguradoras: seguradorasList, totalGeral };
}

export type LinhaPivo = { nome: string; valores: Map<number, number>; level: 0 | 1; collapsible?: boolean; collapsed?: boolean; total?: number };

// Achata a hierarquia seguradora→ramo nas linhas da visualização escolhida.
// 'seg'   → só as seguradoras;
// 'ramo'  → ramos somados entre todas as seguradoras (reagrupa de verdade; filtrar
//           a hierarquia repetiria o mesmo ramo uma vez por seguradora);
// 'ambos' → seguradora seguida dos seus ramos, com recolhimento individual.
export function buildCompPivotRows(seguradoras: SegPivo[], view: VisaoPivo, recolhidas: ReadonlySet<string>): LinhaPivo[] {
  if (view === 'seg') {
    return seguradoras.map(s => ({ nome: s.nome, valores: s.valores, level: 0 as const }));
  }
  if (view === 'ramo') {
    const porRamo = new Map<string, Map<number, number>>();
    seguradoras.forEach(s => s.ramos.forEach(r => {
      if (!porRamo.has(r.nome)) porRamo.set(r.nome, new Map());
      const acc = porRamo.get(r.nome)!;
      r.valores.forEach((v, ano) => acc.set(ano, (acc.get(ano) || 0) + v));
    }));
    const soma = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    return [...porRamo.entries()]
      .map(([nome, valores]) => ({ nome, valores, level: 0 as const, total: soma(valores) }))
      .sort((a, b) => (b.total as number) - (a.total as number));
  }
  const rows: LinhaPivo[] = [];
  seguradoras.forEach(s => {
    const recolhida = recolhidas.has(s.nome);
    rows.push({ nome: s.nome, valores: s.valores, level: 0, collapsible: s.ramos.length > 0, collapsed: recolhida });
    if (!recolhida) s.ramos.forEach(r => rows.push({ nome: r.nome, valores: r.valores, level: 1 }));
  });
  return rows;
}

export const campoPivo = (m: MetricaPivo): 'com' | 'premio' => (m === 'comissao' ? 'com' : 'premio');

/** Rótulo da primeira coluna da tabela. */
export const rotuloColunaPivo = (v: VisaoPivo): string => (v === 'seg' ? 'Seguradora' : v === 'ramo' ? 'Ramo' : 'Seguradora / Ramo');

/** Nomes de todas as seguradoras (Recolher tudo). */
export const nomesSegPivo = (fd: Linha[], m: MetricaPivo): string[] => getCompPivotData(fd, campoPivo(m)).seguradoras.map(s => s.nome);

export type ExportacaoPivo = { cabecalho: string[]; linhas: Record<string, string | number>[]; arquivo: string };
/** exportCompPivotAs('xlsx'): exatamente a visualização em tela — incluindo grupos recolhidos. */
export function exportacaoPivo(d: DadosPivo, view: VisaoPivo, recolhidas: ReadonlySet<string>): ExportacaoPivo {
  const { years, seguradoras, totalGeral } = d;
  const labelCol = view === 'ramo' ? 'Ramo' : 'Seguradora';
  const linhas = buildCompPivotRows(seguradoras, view, recolhidas).map(r => {
    const row: Record<string, string | number> = view === 'ambos'
      ? { 'Seguradora': r.level === 0 ? r.nome : '', 'Ramo': r.level === 1 ? r.nome : '' }
      : { [labelCol]: r.nome };
    years.forEach(y => {
      const v = r.valores.get(y) || 0, t = totalGeral.get(y) || 0;
      row[String(y)] = v;
      row[y + ' %'] = t > 0 ? v / t : 0;
    });
    return row;
  });
  // Ordem explícita: chaves como '2025' são índices inteiros em JS e migram para o
  // início do objeto, jogando a coluna de rótulo para o meio da planilha.
  const cabecalho = (view === 'ambos' ? ['Seguradora', 'Ramo'] : [labelCol]).concat(...years.map(y => [String(y), y + ' %']));
  const sufixo = view === 'seg' ? 'Seguradora' : view === 'ramo' ? 'Ramo' : 'Seguradora_Ramo';
  return { cabecalho, linhas, arquivo: 'Comparativo_' + sufixo + '.xlsx' };
}

// ── Maiores variações — ranking por produtor/seguradora/ramo ──────────────────
// Agrupa prêmio ou comissão de TIPOS_PROD por dimensão escolhida, separando novo
// (N+EN) de renovação (R+ER), e ordena pelo Δ absoluto do total (quem mais
// cresceu/caiu). União das chaves dos dois períodos, ausente = 0.
export type DimRank = 'colab' | 'seg' | 'ramo';
export type MetricaRank = 'premio' | 'com';
type Soma = { novo: number; renov: number; total: number };
export type LinhaRank = { key: string; a: Soma; p: Soma; deltaTotal: number };

export function getCompRankData(dataAtual: Linha[], dataPrev: Linha[], dim: DimRank, metricField: MetricaRank): LinhaRank[] {
  const agg = (data: Linha[]) => {
    const map = new Map<string, Soma>();
    data.forEach(r => {
      if (!TIPOS_PROD.includes(r.tipo)) return;
      const key = r[dim] || 'Sem informação';
      if (!map.has(key)) map.set(key, { novo: 0, renov: 0, total: 0 });
      const e = map.get(key)!;
      const v = r[metricField] || 0;
      if (r.tipo === 'N' || r.tipo === 'EN') e.novo += v;
      else if (r.tipo === 'R' || r.tipo === 'ER') e.renov += v;
      e.total += v;
    });
    return map;
  };
  const mapA = agg(dataAtual), mapP = agg(dataPrev);
  const keys = new Set([...mapA.keys(), ...mapP.keys()]);
  const zero: Soma = { novo: 0, renov: 0, total: 0 };
  const rows = [...keys].map(key => {
    const a = mapA.get(key) || zero, p = mapP.get(key) || zero;
    return { key, a, p, deltaTotal: a.total - p.total };
  });
  rows.sort((r1, r2) => r2.deltaTotal - r1.deltaTotal);
  return rows;
}

// Badge de Δ% reaproveitando .kpi-comp-trend/.trend-*. vP=0 e vA>0 vira "novo" em vez
// de 100%/Infinity enganoso; ambos 0 vira "—".
export function compRankDeltaBadge(vA: number, vP: number): { cls: string; txt: string } {
  if (vA === 0 && vP === 0) return { cls: 'trend-neutral', txt: '—' };
  if (vP === 0) return { cls: 'trend-up', txt: 'novo' };
  const diff = ((vA - vP) / Math.abs(vP)) * 100;
  const cls = diff > 0.1 ? 'trend-up' : diff < -0.1 ? 'trend-down' : 'trend-neutral';
  const txt = (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
  return { cls, txt };
}

export const ROTULOS_DIM_RANK: Record<DimRank, string> = { colab: 'Produtor', seg: 'Seguradora', ramo: 'Ramo' };
export const RANK_LIMITE = 25;

export type TabelaRank = { rotuloDim: string; linhas: LinhaRank[]; total: number; contador: string };

export function tabelaRank(rows: LinhaRank[], dim: DimRank): TabelaRank {
  // Recorta pelos 25 MAIORES movimentos em módulo (não pelo topo do ranking com sinal):
  // cortar por Δ assinado descartaria justamente as maiores quedas, que é metade da
  // informação que se procura aqui. Depois reordena por Δ com sinal — cresceu em cima,
  // caiu embaixo.
  const shown = rows.length > RANK_LIMITE
    ? [...rows].sort((r1, r2) => Math.abs(r2.deltaTotal) - Math.abs(r1.deltaTotal))
      .slice(0, RANK_LIMITE)
      .sort((r1, r2) => r2.deltaTotal - r1.deltaTotal)
    : rows;
  return {
    rotuloDim: ROTULOS_DIM_RANK[dim], linhas: shown, total: rows.length,
    contador: rows.length > RANK_LIMITE ? `Mostrando as ${shown.length} maiores variações de ${rows.length}` : '',
  };
}
