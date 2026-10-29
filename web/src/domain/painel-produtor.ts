import type { DataISO, Linha } from './tipos';
import { filtrarLinhas, FILTROS_VAZIOS } from './filtros';
import { isApolice, SIT } from './situacoes';

// ── Painel do produtor: funções puras (sem React, sem servidor) ────────────────
// COLABORADOR pode trazer dupla/trio separados por " , ". A apólice compartilhada vale
// o valor cheio para cada nome; com vários nomes marcados, a linha conta uma única vez.

/** Nomes de uma célula COLABORADOR (separador " , ", com trim). Vazio = ninguém. */
export const nomesDoColab = (colab: string): string[] =>
  String(colab || '').split(' , ').map(s => s.trim()).filter(Boolean);

export const pertenceA = (r: Pick<Linha, 'colab'>, nomes: ReadonlySet<string>): boolean =>
  nomesDoColab(r.colab).some(n => nomes.has(n));

/** Nomes distintos com a quantidade de linhas em que aparecem (dupla conta para cada um). */
export function nomesDistintos(linhas: Linha[]): { nome: string; qtd: number }[] {
  const m = new Map<string, number>();
  for (const r of linhas) for (const n of new Set(nomesDoColab(r.colab))) m.set(n, (m.get(n) || 0) + 1);
  return [...m].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
}

export type Totais = { premio: number; com: number; qtd: number };
const zero = (): Totais => ({ premio: 0, com: 0, qtd: 0 });
const somar = (t: Totais, r: Linha) => { t.premio += r.premio; t.com += r.com; t.qtd++; };

// ── Meses ('YYYY-MM') ──
const mesNum = (mes: string): [number, number] => [+mes.slice(0, 4), +mes.slice(5, 7)];
const fmtMes = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}`;
export function mesAnterior(mes: string): string { const [a, m] = mesNum(mes); return m === 1 ? fmtMes(a - 1, 12) : fmtMes(a, m - 1); }
export function mesSeguinte(mes: string): string { const [a, m] = mesNum(mes); return m === 12 ? fmtMes(a + 1, 1) : fmtMes(a, m + 1); }
export const mesDe = (hoje: DataISO): string => hoje.slice(0, 7);

/** Produção do mês = regra da aba Produção (todos os tipos) ancorada na vigência. Linha sem vig fica de fora. */
function linhasDoMes(linhas: Linha[], nomes: ReadonlySet<string>, mes: string): Linha[] {
  return filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vigIni: `${mes}-01`, vigFim: `${mes}-31` })
    .filter(r => r.vig && pertenceA(r, nomes));
}

export function producaoDoMes(linhas: Linha[], nomes: ReadonlySet<string>, mes: string): Totais {
  const t = zero();
  for (const r of linhasDoMes(linhas, nomes, mes)) somar(t, r);
  return t;
}

export type BarraNR = { mes: string; novas: Totais; renov: Totais; outros: Totais; total: Totais };
const FAM_N = new Set(['N', 'EN', 'CN']), FAM_R = new Set(['R', 'ER', 'CR']);

function barraNR(linhas: Linha[], nomes: ReadonlySet<string>, mes: string): BarraNR {
  const b: BarraNR = { mes, novas: zero(), renov: zero(), outros: zero(), total: zero() };
  for (const r of linhasDoMes(linhas, nomes, mes)) {
    somar(FAM_N.has(r.tipo) ? b.novas : FAM_R.has(r.tipo) ? b.renov : b.outros, r);
    somar(b.total, r);
  }
  return b;
}

/**
 * Compara o mês com o mesmo mês do ano anterior (conforme o teste do brief: 2026-01 × 2025-01).
 * Ano anterior com total ≤ 0 (zero ou só cancelamentos): variação null — o sinal da razão enganaria.
 */
export function comparativoNR(linhas: Linha[], nomes: ReadonlySet<string>, mes: string): { atual: BarraNR; anterior: BarraNR; variacao: number | null } {
  const atual = barraNR(linhas, nomes, mes), anterior = barraNR(linhas, nomes, fmtMes(mesNum(mes)[0] - 1, mesNum(mes)[1]));
  return { atual, anterior, variacao: anterior.total.premio <= 0 ? null : atual.total.premio / anterior.total.premio - 1 };
}

export function mesAMes(linhas: Linha[], nomes: ReadonlySet<string>, ano: number): { premio: number[]; com: number[] } {
  const premio: number[] = [], com: number[] = [];
  for (let m = 1; m <= 12; m++) { const t = producaoDoMes(linhas, nomes, fmtMes(ano, m)); premio.push(t.premio); com.push(t.com); }
  return { premio, com };
}

// ── A renovar ──
export type Faixa = 'vencida' | '1' | '3' | '7' | '15' | '30' | 'neutra';
export const CORES_FAIXA: Record<Faixa, string> = {
  vencida: '#7f1d1d', '1': '#FF3B3B', '3': '#FF6B4A', '7': '#F5A623', '15': '#d6c23a', '30': '#7fb3ff', neutra: '#3E4D68',
};
export function faixaUrgencia(dias: number): Faixa {
  return dias < 0 ? 'vencida' : dias <= 1 ? '1' : dias <= 3 ? '3' : dias <= 7 ? '7' : dias <= 15 ? '15' : dias <= 30 ? '30' : 'neutra';
}

export type ItemRenovar = { cli: string; ramo: string; seg: string; fim: DataISO; colab: string; apolice: string; dias: number; faixa: Faixa };

const utcDia = (d: DataISO) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

/** Apólice N/R do(s) nome(s) cujo fim cai no mês, ainda Ativa ou Vencida. `vencidas` = fim antes de hoje. */
export function aRenovar(linhas: Linha[], nomes: ReadonlySet<string>, mes: string, hoje: DataISO): { vencidas: ItemRenovar[]; aVencer: ItemRenovar[] } {
  const itens = linhas
    .filter(r => isApolice(r) && (r.tipo === 'N' || r.tipo === 'R') && r.fim.slice(0, 7) === mes
      && (r.sit === SIT.ATIVA || r.sit === SIT.VENCIDA) && pertenceA(r, nomes))
    .sort((a, b) => (a.fim < b.fim ? -1 : a.fim > b.fim ? 1 : 0))
    .map((r): ItemRenovar => {
      const dias = utcDia(r.fim) - utcDia(hoje);
      return { cli: r.cli, ramo: r.ramo, seg: r.seg, fim: r.fim, colab: r.colab, apolice: r.apolice, dias, faixa: faixaUrgencia(dias) };
    });
  return { vencidas: itens.filter(i => i.fim < hoje), aVencer: itens.filter(i => i.fim >= hoje) };
}

// ── Rótulos do painel ──
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'outubro' | 'outubro/2026' (ano) | 'out/2026' (abrev) | 'Outubro de 2026' (titulo). */
export function nomeMes(mes: string, forma: 'mes' | 'ano' | 'abrev' | 'titulo' = 'mes'): string {
  const [a, m] = mesNum(mes), n = MESES_PT[m - 1];
  return forma === 'ano' ? `${n}/${a}` : forma === 'abrev' ? `${n.slice(0, 3)}/${a}` : forma === 'titulo' ? `${n[0].toUpperCase()}${n.slice(1)} de ${a}` : n;
}

const umaCasa = (v: number) => v.toFixed(1).replace('.', ',');

/** Rótulo curto em cima das barras: 48k (≥ 10 mil), 7,9k (≥ 1 mil), 420 (inteiro). */
export function fCurto(v: number): string {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (Math.round(a) < 1000) return s + Math.round(a);
  const k = a / 1000;
  return s + (+k.toFixed(1) >= 10 ? `${Math.round(k)}k` : `${umaCasa(k)}k`);
}

/** Valor nos segmentos das barras N+R: 'R$ 15,8 mil'; abaixo de mil, reais inteiros. */
export function fMil(v: number): string {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (Math.round(a) < 1000) return `${s}R$ ${Math.round(a)}`;
  return `${s}R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(a / 1000)} mil`;
}

/** Selo de prazo da lista "A renovar". */
export function textoPrazo(dias: number): string {
  if (dias < 0) return `venceu há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`;
  return dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
}

/** Nome(s) do colaborador sem o sufixo da equipe (parte antes de " - "), separados por vírgula. */
export const nomeCurto = (colab: string): string => nomesDoColab(colab).map(n => n.split(' - ')[0].trim()).join(', ');

/** Uma página da lista (1-based); página fora do intervalo cai no limite mais próximo. */
export function paginar<T>(itens: T[], porPagina: number, pagina: number): { pagina: number; paginas: number; itens: T[] } {
  const n = Math.max(1, Math.floor(porPagina));
  const paginas = Math.max(1, Math.ceil(itens.length / n));
  const p = Math.min(paginas, Math.max(1, Math.floor(pagina)));
  return { pagina: p, paginas, itens: itens.slice((p - 1) * n, p * n) };
}
