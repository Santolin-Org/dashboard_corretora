import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { dadosComp, dadosKpisComp, kpisComp } from '../../src/domain/comparativo';
import { FILTROS_VAZIOS } from '../../src/domain/filtros';

// Ano anterior: produziu 1.000 (N 600 + R 300 + EN 60 + ER 40). Este ano: renovou R 750 + ER 50 = 800.
const L = (tipo: string, vig: string, premio: number) => linha({ tipo, vig, premio, fim: '' });
const TODAS = [
  L('N', '2025-02-01', 600), L('R', '2025-03-01', 300), L('EN', '2025-04-01', 60), L('ER', '2025-05-01', 40),
  L('R', '2026-02-01', 750), L('ER', '2026-03-01', 50), L('N', '2026-04-01', 999),
];
const cartao = () => {
  const d = dadosComp(TODAS, FILTROS_VAZIOS, { start: '2026-01-01', end: '2026-06-30' });
  return kpisComp(d, dadosKpisComp(TODAS, FILTROS_VAZIOS, d)).flatMap((b) => b.cartoes).find((c) => c.rotulo === 'Prêmio renovação')!;
};

describe('Prêmio renovação: compara com a produção N + R do ano anterior', () => {
  it('valor é o R + ER do período; a base é o N + R + EN + ER do ano anterior', () => {
    const c = cartao();
    expect(c.bruto).toEqual({ unidade: 'money', atual: 800, anterior: 1000 });
    expect(c.trendTxt).toBe('▼ 20.0%');
    expect(c.trendCls).toBe('trend-down');
    expect(c.foot).toMatch(/^base N\+R ant\. .*1\.000,00 · Δ −.*200,00$/);
    expect(c.titulo).toMatch(/comparada com a produção N \+ R/);
  });
});
