// Aba Visão geral (main.js "VISÃO GERAL" + "Cancel filter (main tab)"): cálculos puros, sem DOM.
// Cada função recebe as linhas já filtradas (FD) e devolve dados; a formatação de texto que o app
// antigo montava em template fica aqui só onde o harness compara o texto (KPIs, variação, legenda).
import type { DataISO, Linha } from './tipos';
import { addDiasISO, anoISO } from './datas';
import { fBRL, fN, fP } from './formatos';
import { shortRamo } from './ramos';

// O app antigo agrupa por ano/mês com getFullYear()/getMonth() (data LOCAL do Date), e não pela
// fatia UTC do fmtD: ver Linha.vigLocal/emLocal (só presentes quando diferem).
const vigDoAno = (r: Linha): DataISO => r.vig ? (r.vigLocal || r.vig) : '';
const vigOuEmLocal = (r: Linha): DataISO => r.vig ? (r.vigLocal || r.vig) : r.em ? (r.emLocal || r.em) : '';

export type Metrica = 'premio' | 'comissao';
/** getMetric(...) === 'comissao' ? 'com' : 'premio' */
export const campoDaMetrica = (m: Metrica): 'com' | 'premio' => (m === 'comissao' ? 'com' : 'premio');

export type CartaoKpi = { rotulo: string; valor: string; sub: string; cor: 'k-blue' | 'k-green' | 'k-purple' | 'k-teal' | 'k-amber' };

/**
 * renderKPIs. `semFiltroDeData` = os quatro campos de data (vigência/emissão) vazios: nesse caso
 * os KPIs olham só o ano corrente (vig, senão em).
 */
export function cartoesKpi(fd: Linha[], hoje: DataISO, semFiltroDeData: boolean): CartaoKpi[] {
  let d = fd;
  if (semFiltroDeData) {
    const cy = anoISO(hoje);
    d = fd.filter(r => {
      const dt = vigOuEmLocal(r);
      return dt && anoISO(dt) === cy;
    });
  }

  const premio = d.reduce((s, r) => s + r.premio, 0), com = d.reduce((s, r) => s + r.com, 0);
  const cliSet = new Set(d.map(r => r.cli)), withP = d.filter(r => r.premio > 0);
  const ticket = withP.length ? withP.reduce((s, r) => s + r.premio, 0) / withP.length : 0;
  const d30 = addDiasISO(hoje, 30);
  const venc30 = d.filter(r => r.fim && r.fim >= hoje && r.fim <= d30).length;

  const ctxLabelPolices = semFiltroDeData ? fN(d.length) + ' apólices este ano' : fN(d.length) + ' apólices';
  const ctxLabel = semFiltroDeData ? 'neste ano' : 'na seleção atual';

  return [
    { rotulo: 'Prêmio total', valor: fBRL(premio), sub: ctxLabelPolices, cor: 'k-blue' },
    { rotulo: 'Comissão total', valor: fBRL(com), sub: premio ? fP(com / premio) + ' do prêmio' : '—', cor: 'k-green' },
    { rotulo: 'Ticket médio: Prêmio', valor: fBRL(ticket), sub: fN(withP.length) + ' c/ prêmio', cor: 'k-purple' },
    { rotulo: 'Ticket médio: Comissão', valor: fBRL(withP.length ? com / withP.length : 0), sub: 'por apólice', cor: 'k-green' },
    { rotulo: 'Clientes únicos', valor: fN(cliSet.size), sub: ctxLabel, cor: 'k-teal' },
    { rotulo: 'Vencendo em 30d', valor: fN(venc30), sub: 'renovações pendentes', cor: 'k-amber' },
  ];
}

export const MESES_ROTULOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type Variacao = { cls: 'var-pos' | 'var-neg' | 'var-neu'; txt: string; titulo: string };
export type EvolucaoMensal = { anoAtual: number; anoAnterior: number; atual: number[]; anterior: number[]; variacoes: Variacao[] };

/** renderEvolucao: série mensal por vigência do ano corrente e do anterior + barra de variação %. */
export function evolucaoMensal(fd: Linha[], metrica: Metrica, hoje: DataISO): EvolucaoMensal {
  const field = campoDaMetrica(metrica);
  const curYear = anoISO(hoje), prevYear = curYear - 1;
  const cur: Record<string, number> = {}, prev: Record<string, number> = {};
  fd.forEach(r => {
    const dt = vigDoAno(r);
    if (!dt) return;
    const y = anoISO(dt), m = dt.slice(5, 7);
    if (y === curYear) cur[m] = (cur[m] || 0) + r[field]; else if (y === prevYear) prev[m] = (prev[m] || 0) + r[field];
  });
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const variacoes = months.map((m, i): Variacao => {
    const c = cur[m] || 0, p = prev[m] || 0; let cls: Variacao['cls'] = 'var-neu', txt = '—';
    if (p > 0) { const pct = ((c - p) / p) * 100; cls = pct >= 0 ? 'var-pos' : 'var-neg'; txt = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'; }
    else if (c > 0) { cls = 'var-pos'; txt = 'novo'; }
    return { cls, txt, titulo: `${MESES_ROTULOS[i]}: ${txt}` };
  });
  return {
    anoAtual: curYear, anoAnterior: prevYear,
    atual: months.map(m => cur[m] || 0), anterior: months.map(m => prev[m] || 0), variacoes,
  };
}

const motivoDe = (r: Linha): string => r.motivo || 'Não informado';
const porContagem = (rs: Linha[]): [string, number][] => {
  const mot: Record<string, number> = {}; rs.forEach(r => { const m = motivoDe(r); mot[m] = (mot[m] || 0) + 1; });
  return Object.entries(mot).sort((a, b) => b[1] - a[1]);
};

export type Cancelamentos = {
  /** Todos os motivos (do filtro de cancelamento), com contagem, por contagem decrescente. */
  todos: [string, number][];
  /** Quantidade de canceladas dentro da seleção de motivos. */
  filtradas: number;
  /** Rótulos (truncados em 40) e valores do gráfico, só dos motivos selecionados. */
  rotulos: string[]; valores: number[];
  /** Altura do #cancel-wrap em px: 60 sem dados, senão Math.max(220, n*38+60). */
  alturaPx: number;
};

/**
 * renderCancelamentos. `selecionados` = activeCancelMotivos: null = todos os motivos marcados.
 */
export function cancelamentos(fd: Linha[], selecionados: ReadonlySet<string> | null): Cancelamentos {
  const canceladas = fd.filter(r => r.sit === 'Cancelada');
  const todos = porContagem(canceladas);
  const filtered = selecionados ? canceladas.filter(r => selecionados.has(motivoDe(r))) : canceladas;
  const sorted = porContagem(filtered);
  return {
    todos, filtradas: filtered.length,
    rotulos: sorted.map(m => m[0].length > 40 ? m[0].slice(0, 37) + '...' : m[0]),
    valores: sorted.map(m => m[1]),
    alturaPx: sorted.length ? Math.max(220, sorted.length * 38 + 60) : 60,
  };
}

/**
 * cancelCbToggle: marca/desmarca um motivo. Partindo de "todos" (null) a seleção vira o conjunto de
 * todos os motivos antes da mudança; chegando a todos marcados volta a null.
 */
export function alternarMotivo(sel: ReadonlySet<string> | null, todos: string[], motivo: string, marcado: boolean): Set<string> | null {
  const novo = new Set(sel ?? todos);
  if (marcado) novo.add(motivo); else novo.delete(motivo);
  return novo.size >= todos.length ? null : novo;
}

const nomeCurtoSeguradora = (n: string): string => n.replace(' CIA DE SEGUROS GERAIS S/A', '').replace(' CIA NAC DE SEGUROS S/A', '').replace(' SEGUROS S/A', '').replace(' SEGURADORA S/A', '').replace(' SEGURADORA', '').replace(' SEGS CORPORATIVOS SA', '').trim();

export type ConcentracaoSeguradora = { rotulos: string[]; valores: number[]; total: number; legenda: { rotulo: string; pct: string }[] };

/** renderSeguradora: top 8 por seguradora + "Outros"; legenda com a participação. */
export function concentracaoSeguradora(fd: Linha[], metrica: Metrica): ConcentracaoSeguradora {
  const field = campoDaMetrica(metrica);
  const bySeg: Record<string, number> = {}; fd.forEach(r => { if (r.seg) bySeg[r.seg] = (bySeg[r.seg] || 0) + r[field]; });
  const sorted = Object.entries(bySeg).sort((a, b) => b[1] - a[1]);
  const top8 = sorted.slice(0, 8), outros = sorted.slice(8).reduce((s, e) => s + e[1], 0);
  const items: [string, number][] = outros > 0 ? [...top8, ['Outros', outros]] : top8;
  const total = items.reduce((s, e) => s + e[1], 0);
  const rotulos = items.map(e => nomeCurtoSeguradora(e[0]));
  return {
    rotulos, valores: items.map(e => e[1]), total,
    legenda: rotulos.map((l, i) => ({ rotulo: l, pct: fP(total ? items[i][1] / total : 0) })),
  };
}

export type ProducaoPorRamo = { rotulos: string[]; valores: number[] };

/** renderRamo: top 8 ramos (nome curto). */
export function producaoPorRamo(fd: Linha[], metrica: Metrica): ProducaoPorRamo {
  const field = campoDaMetrica(metrica);
  const byR: Record<string, number> = {}; fd.forEach(r => { if (r.ramo) byR[r.ramo] = (byR[r.ramo] || 0) + r[field]; });
  const sorted = Object.entries(byR).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { rotulos: sorted.map(e => shortRamo(e[0])), valores: sorted.map(e => e[1]) };
}
