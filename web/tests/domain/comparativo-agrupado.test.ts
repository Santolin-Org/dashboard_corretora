import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { graficoComp, graficoCompAgrupado, type DadosComp } from '../../src/domain/comparativo';

// Prêmio novo (tipo N) por mês: um valor por mês facilita somar à mão.
const n = (vig: string, premio: number) => linha({ tipo: 'N', vig, premio, com: premio / 10 });
const dados = (atual: ReturnType<typeof n>[], anterior: ReturnType<typeof n>[], start = '2025-01-01', end = '2026-12-31'): DadosComp => ({
  start, end, prev: { start: `${+start.slice(0, 4) - 1}${start.slice(4)}`, end: `${+end.slice(0, 4) - 1}${end.slice(4)}` },
  emPrev: { start: '', end: '' }, atual, anterior,
});
const HOJE = '2026-10-29';

// 2024 (só no anterior), 2025 e 2026 (nos dois: os períodos se sobrepõem, como na aba).
const ANTERIOR = [n('2024-01-10', 10), n('2024-04-10', 20), n('2024-10-10', 40), n('2025-01-10', 100), n('2025-02-10', 50), n('2025-04-10', 200), n('2025-07-05', 300), n('2025-10-05', 400)];
const ATUAL = [n('2025-01-10', 100), n('2025-02-10', 50), n('2025-04-10', 200), n('2025-07-05', 300), n('2025-10-05', 400),
  n('2026-01-15', 150), n('2026-04-15', 250), n('2026-05-15', 50), n('2026-07-15', 600), n('2026-10-15', 900)];

describe('graficoCompAgrupado', () => {
  it('mês × ano anterior é exatamente o gráfico de hoje (paridade com o app antigo)', () => {
    const d = dados(ATUAL, ANTERIOR);
    const { rotuloAnterior, ...g } = graficoCompAgrupado(d, 'premio_novo', 'mes', 'ano', HOJE);
    expect(g).toEqual(graficoComp(d, 'premio_novo'));
    expect(rotuloAnterior).toBe('Mesmo período do ano anterior');
  });

  it('trimestre × ano anterior: só trimestres fechados; T4/26 (em andamento) fica de fora', () => {
    const g = graficoCompAgrupado(dados(ATUAL, ANTERIOR), 'premio_novo', 'trimestre', 'ano', HOJE);
    expect(g.labels).toEqual(['T1/25', 'T2/25', 'T3/25', 'T4/25', 'T1/26', 'T2/26', 'T3/26']);
    expect(g.valA).toEqual([150, 200, 300, 400, 150, 300, 600]);
    expect(g.valP).toEqual([10, 20, 0, 40, 150, 200, 300]);
    expect(g.varPct[4]).toBe(0); // 150 contra 150
    expect(g.varPct[5]).toBeCloseTo(50); // 300 contra 200
    expect(g.varPct[6]).toBeCloseTo(100); // 600 contra 300
  });

  it('trimestre × período anterior: compara com o trimestre imediatamente antes (o 1º busca o anterior ao intervalo)', () => {
    const g = graficoCompAgrupado(dados(ATUAL, ANTERIOR), 'premio_novo', 'trimestre', 'anterior', HOJE);
    expect(g.rotuloAnterior).toBe('Período imediatamente anterior');
    expect(g.valA).toEqual([150, 200, 300, 400, 150, 300, 600]);
    expect(g.valP).toEqual([40, 150, 200, 300, 400, 150, 300]); // T4/24, T1/25, …, T2/26
    expect(g.varPct[4]).toBeCloseTo(-62.5); // T1/26 150 contra T4/25 400
  });

  it('semestre e ano', () => {
    const s = graficoCompAgrupado(dados(ATUAL, ANTERIOR), 'premio_novo', 'semestre', 'ano', HOJE);
    expect(s.labels).toEqual(['S1/25', 'S2/25', 'S1/26']); // S2/26 ainda não fechou
    expect(s.valA).toEqual([350, 700, 450]);
    expect(s.valP).toEqual([30, 40, 350]);
    const a = graficoCompAgrupado(dados(ATUAL, ANTERIOR), 'premio_novo', 'ano', 'ano', HOJE);
    expect(a.labels).toEqual(['2025']);
    expect(a.valA).toEqual([1050]);
    expect(a.valP).toEqual([70]);
  });

  it('período que não cabe inteiro no intervalo fica de fora (intervalo começando no meio do trimestre)', () => {
    const g = graficoCompAgrupado(dados(ATUAL, ANTERIOR, '2025-02-01', '2026-06-30'), 'premio_novo', 'trimestre', 'ano', HOJE);
    expect(g.labels).toEqual(['T2/25', 'T3/25', 'T4/25', 'T1/26', 'T2/26']);
  });

  it('mês × período anterior: cada mês contra o mês anterior', () => {
    const g = graficoCompAgrupado(dados(ATUAL, ANTERIOR, '2026-01-01', '2026-05-31'), 'premio_novo', 'mes', 'anterior', HOJE);
    expect(g.labels).toEqual(['Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26']);
    expect(g.valA).toEqual([150, 0, 0, 250, 50]);
    expect(g.valP).toEqual([0, 150, 0, 0, 250]); // dez/25 não tem nada
  });

  it('nenhum período fechado: listas vazias', () => {
    const g = graficoCompAgrupado(dados(ATUAL, ANTERIOR, '2026-10-01', '2026-12-31'), 'premio_novo', 'trimestre', 'ano', HOJE);
    expect(g.labels).toEqual([]);
    expect(g.valA).toEqual([]);
  });
});
