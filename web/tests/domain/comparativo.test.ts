import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import { FILTROS_VAZIOS, filtrarLinhas, type FiltrosGlobais } from '../../src/domain/filtros';
import {
  METRICAS_COMP, buildCompPivotRows, campoPivo, chipsEscopo, dadosComp, dadosKpisComp, fmtLabel, getCompPivotData, getCompRankData,
  getMonthsInRange, graficoComp, kpisComp, periodoComp, prevYearDates, rotuloColunaPivo, shiftEmissaoRangeToPrevYear, tabelaRank, tagsPeriodo,
  type DimRank, type MetricaComp, type MetricaPivo, type MetricaRank, type PeriodoManual, type VisaoPivo,
} from '../../src/domain/comparativo';
import { fBRL, fP } from '../../src/domain/formatos';
import { carregarFixture } from './fixture';

const HOJE = '2026-10-15';
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

type Golden = { textos: Record<string, string>; graficos: Record<string, { labels: string[]; datasets: { label?: string; data: number[] }[] }> };
const dourado = (c: string): Golden => JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${c}.json`), 'utf8'));
const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();

type Caso = {
  f?: Partial<FiltrosGlobais>; manual?: PeriodoManual | null; metrica?: MetricaComp;
  visao?: VisaoPivo; metricaPivo?: MetricaPivo; recolher?: boolean; dim?: DimRank; metricaRank?: MetricaRank;
};
const VIG = { vigIni: '2026-01-01', vigFim: '2026-09-30' };
const CASOS: Record<string, Caso> = {
  'comparativo-padrao': {},
  'comparativo-vigencia': { f: VIG },
  'comparativo-colab': { f: { col: ['ANA CLARA MENDES'] } },
  'comparativo-tipos': { f: { tipos: ['N', 'EN'] } },
  'comparativo-ramo-seg': { f: { ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] } },
  'comparativo-manual': { manual: { start: '2026-01-01', end: '2026-06-30' } },
  'comparativo-pivo-seg': { visao: 'seg' },
  'comparativo-pivo-ramo': { visao: 'ramo' },
  'comparativo-pivo-recolhido-comissao': { metricaPivo: 'comissao', recolher: true },
  'comparativo-ranking-seg-comissao': { dim: 'seg', metricaRank: 'com' },
  'comparativo-ranking-ramo': { dim: 'ramo' },
  // período manual (03/01–31/08) e vigência global; depois "Seguir filtro global" volta a vigência global
  'comparativo-manual-seguir-global': { f: VIG, manual: null },
  ...Object.fromEntries(METRICAS_COMP.map(m => [`comparativo-metrica-${m.valor.replace('_', '-')}`, { metrica: m.valor }])),
};

const textoKpis = (k: ReturnType<typeof kpisComp>) => colapsar(k.map(b => `${b.titulo} ${b.cartoes.map(c => `${c.rotulo} ${c.trendTxt} ${c.valor} ${c.foot}`).join(' ')}`).join(' '));
const celulas = (v: Map<number, number>, years: number[], total: Map<number, number>) =>
  years.map(y => { const x = v.get(y) || 0, t = total.get(y) || 0; return fBRL(x) + fP(t > 0 ? x / t : 0); }).join('');
const textoPivo = (fd: Linha[], visao: VisaoPivo, m: MetricaPivo, rec: Set<string>) => {
  const { years, seguradoras, totalGeral } = getCompPivotData(fd, campoPivo(m));
  if (!years.length || !seguradoras.length) return 'Nenhum dado para o filtro atual.';
  const corpo = buildCompPivotRows(seguradoras, visao, rec)
    .map(r => (r.level === 0 && r.collapsible ? (r.collapsed ? '▸' : '▾') : '') + r.nome + celulas(r.valores, years, totalGeral)).join('');
  return colapsar(`${rotuloColunaPivo(visao)} ${years.join('')} ${years.map(() => 'Valor%').join('')} ${corpo}Total geral${celulas(totalGeral, years, totalGeral)}`);
};
describe('Comparativo de períodos contra os dourados da fixture', () => {
  it.each(Object.keys(CASOS))('%s: período, chips, gráfico, KPIs, pivô e ranking', (nome) => {
    const c = CASOS[nome], g = dourado(nome);
    const f: FiltrosGlobais = { ...FILTROS_VAZIOS, ...c.f };
    const filtrado = !!c.f; // modo inicial: FD = ALL (inclui as faturas de saúde que o applyFilters descartaria)
    const fd = filtrado ? filtrarLinhas(ALL, f) : ALL;
    // o cenário manual-seguir-global termina em "Seguir filtro global" (manual = null)
    const manual = c.manual ?? null;
    const per = periodoComp(manual, f, HOJE);
    const d = dadosComp(ALL, f, per);

    expect(tagsPeriodo(per, d.prev).atual).toBe(g.textos['comp-periodo-atual-tag']);
    expect(tagsPeriodo(per, d.prev).anterior).toBe(g.textos['comp-periodo-prev-tag']);
    expect(chipsEscopo(f, !!manual, per.seguindoGlobal).chips.join('')).toBe(g.textos['comp-scope-chips']);

    const metrica = c.metrica ?? 'premio_novo';
    const gr = graficoComp(d, metrica), gg = g.graficos['ch-comp-main'];
    expect(gr.labels).toEqual(gg.labels);
    expect(gg.datasets.map(x => x.label)).toEqual([`Atual — ${gr.rotulo}`, `Anterior — ${gr.rotulo}`, 'Variação %']);
    expect([gr.valA, gr.valP, gr.varPct].map(a => a.map(x => Number(x.toFixed(6))))).toEqual(gg.datasets.map(x => x.data.map(y => Number(y.toFixed(6)))));

    expect(textoKpis(kpisComp(d, dadosKpisComp(ALL, f, d)))).toBe(g.textos['comp-kpis-grid']);

    const rec = new Set<string>();
    if (c.recolher) getCompPivotData(fd, campoPivo(c.metricaPivo ?? 'premio')).seguradoras.forEach(s => rec.add(s.nome));
    expect(textoPivo(fd, c.visao ?? 'ambos', c.metricaPivo ?? 'premio', rec)).toBe(g.textos['comp-pivot-wrap']);

    const dim = c.dim ?? 'colab', mr = c.metricaRank ?? 'premio';
    const rows = getCompRankData(d.atual, d.anterior, dim, mr), t = tabelaRank(rows, dim);
    expect(t.contador).toBe(g.textos['comp-rank-counter']);
    if (!rows.length) return;
    const d3 = (a: { novo: number; renov: number; total: number }, p: { novo: number; renov: number; total: number }, k: 'novo' | 'renov' | 'total') =>
      fBRL(a[k]) + fBRL(p[k]) + (a[k] === 0 && p[k] === 0 ? '—' : p[k] === 0 ? 'novo' : (() => { const x = ((a[k] - p[k]) / Math.abs(p[k])) * 100; return (x > 0 ? '+' : '') + x.toFixed(1) + '%'; })());
    const esperado = colapsar(`${t.rotuloDim} Novo atualNovo anteriorΔ% novo Renov. atualRenov. anteriorΔ% renov. Total atualTotal anteriorΔ% total ` +
      t.linhas.map(r => `${r.key} ${d3(r.a, r.p, 'novo')} ${d3(r.a, r.p, 'renov')} ${d3(r.a, r.p, 'total')}`).join(' '));
    expect(esperado).toBe(g.textos['comp-rank-wrap']);
  });
});

describe('datas do Comparativo', () => {
  it('prevYearDates: 29/02 vira 01/03 (setFullYear)', () => {
    expect(prevYearDates('2024-02-29', '2024-12-31')).toEqual({ start: '2023-03-01', end: '2023-12-31' });
    expect(prevYearDates('2026-01-01', '2026-06-30')).toEqual({ start: '2025-01-01', end: '2025-06-30' });
  });
  it('emissão: preserva a ponta vazia', () => {
    expect(shiftEmissaoRangeToPrevYear('2026-03-01', '')).toEqual({ start: '2025-03-01', end: '' });
    expect(shiftEmissaoRangeToPrevYear('', '2026-03-01')).toEqual({ start: '', end: '2025-03-01' });
    expect(shiftEmissaoRangeToPrevYear('', '')).toEqual({ start: '', end: '' });
  });
  it('meses do intervalo e rótulos', () => {
    expect(getMonthsInRange('2026-11-15', '2027-02-01').map(m => m.label)).toEqual(['Nov/26', 'Dez/26', 'Jan/27', 'Fev/27']);
    expect(fmtLabel('2026-06-30')).toBe('30/06/2026');
  });
  it('precedência: manual > vigência global > 1º de janeiro até hoje', () => {
    const f = { vigIni: '2026-02-01', vigFim: '2026-03-31' };
    expect(periodoComp({ start: '2026-05-01', end: '2026-05-31' }, f, HOJE)).toMatchObject({ start: '2026-05-01', seguindoGlobal: false });
    expect(periodoComp(null, f, HOJE)).toEqual({ start: '2026-02-01', end: '2026-03-31', seguindoGlobal: true });
    expect(periodoComp(null, { vigIni: '2026-02-01', vigFim: '' }, HOJE)).toEqual({ start: '2026-01-01', end: HOJE, seguindoGlobal: false });
  });
});
