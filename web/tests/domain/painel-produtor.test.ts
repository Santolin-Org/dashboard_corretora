import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import {
  nomesDoColab, pertenceA, nomesDistintos, producaoDoMes, comparativoNR, mesAMes,
  faixaUrgencia, aRenovar, mesAnterior, mesSeguinte, mesDe, CORES_FAIXA,
} from '../../src/domain/painel-produtor';

describe('nomes', () => {
  it('separa por " , " com trim; vazio não é nome', () => {
    expect(nomesDoColab('GABRIELA A - SANTOLIN , MATHEUS G - SANTOLIN')).toEqual(['GABRIELA A - SANTOLIN', 'MATHEUS G - SANTOLIN']);
    expect(nomesDoColab('FERNANDO DE PAULA SERAFIM')).toEqual(['FERNANDO DE PAULA SERAFIM']);
    expect(nomesDoColab('   ')).toEqual([]);
  });
  it('pertenceA: dupla pertence aos dois; nome parecido não', () => {
    const s = new Set(['MATHEUS G - SANTOLIN']);
    expect(pertenceA({ colab: 'GABRIELA A - SANTOLIN , MATHEUS G - SANTOLIN' }, s)).toBe(true);
    expect(pertenceA({ colab: 'MATHEUS G - SANTOLIN X' }, s)).toBe(false);
    expect(pertenceA({ colab: '' }, s)).toBe(false);
  });
  it('nomesDistintos conta a dupla para cada nome', () => {
    const l = [linha({ colab: 'A , B' }), linha({ colab: 'A' }), linha({ colab: '' })];
    expect(nomesDistintos(l)).toEqual([{ nome: 'A', qtd: 2 }, { nome: 'B', qtd: 1 }]);
  });
});
describe('produção', () => {
  it('producaoDoMes segue a aba Produção: inclui endosso e cancelamento, só o mês de vigência, só os nomes', () => {
    const l = [
      linha({ colab: 'A', tipo: 'N', vig: '2026-10-05', premio: 100, com: 10 }),
      linha({ colab: 'A', tipo: 'CN', vig: '2026-10-06', premio: -30, com: -3 }),
      linha({ colab: 'A , B', tipo: 'R', vig: '2026-10-31', premio: 50, com: 5 }),
      linha({ colab: 'A', tipo: 'N', vig: '2026-11-01', premio: 999, com: 99 }),
      linha({ colab: 'C', tipo: 'N', vig: '2026-10-10', premio: 777, com: 77 }),
    ];
    expect(producaoDoMes(l, new Set(['A']), '2026-10')).toEqual({ premio: 120, com: 12, qtd: 3 });
    expect(producaoDoMes(l, new Set(['B']), '2026-10')).toEqual({ premio: 50, com: 5, qtd: 1 }); // valor cheio
    expect(producaoDoMes(l, new Set(['A', 'B']), '2026-10').qtd).toBe(3); // dupla conta uma vez
  });
  it('linha sem vigência não entra em nenhum mês', () => {
    const l = [linha({ colab: 'A', vig: '', premio: 5, com: 1 })];
    expect(producaoDoMes(l, new Set(['A']), '2026-10').qtd).toBe(0);
    expect(mesAMes(l, new Set(['A']), 2026).premio.every(v => v === 0)).toBe(true);
  });
  it('comparativoNR: famílias N/R, total = soma, variação e virada de ano', () => {
    const l = [
      linha({ colab: 'A', tipo: 'N', vig: '2026-01-02', premio: 100, com: 10 }),
      linha({ colab: 'A', tipo: 'ER', vig: '2026-01-03', premio: 20, com: 2 }),
      linha({ colab: 'A', tipo: 'R', vig: '2025-01-09', premio: 60, com: 6 }),
    ];
    const c = comparativoNR(l, new Set(['A']), '2026-01');
    expect(c.atual.novas.premio).toBe(100); expect(c.atual.renov.premio).toBe(20);
    expect(c.atual.total.premio).toBe(120); expect(c.anterior.mes).toBe('2025-01');
    expect(c.variacao).toBeCloseTo(1); // 120/60 − 1
    expect(comparativoNR([], new Set(['A']), '2026-01').variacao).toBeNull();
  });
  it('comparativoNR: outros tipos vão para "outros" e entram no total', () => {
    const l = [linha({ colab: 'A', tipo: 'X', vig: '2026-02-02', premio: 7, com: 1 }), linha({ colab: 'A', tipo: 'CN', vig: '2026-02-03', premio: -2, com: 0 })];
    const c = comparativoNR(l, new Set(['A']), '2026-02');
    expect(c.atual.outros).toEqual({ premio: 7, com: 1, qtd: 1 });
    expect(c.atual.novas.premio).toBe(-2);
    expect(c.atual.total.premio).toBe(5);
  });
  it('mesAMes: 12 posições por mês de vigência do ano', () => {
    const r = mesAMes([linha({ colab: 'A', vig: '2026-03-15', premio: 10, com: 1 })], new Set(['A']), 2026);
    expect(r.premio).toHaveLength(12); expect(r.premio[2]).toBe(10); expect(r.com[2]).toBe(1);
  });
});
describe('a renovar', () => {
  const hoje = '2026-10-22';
  const base = { colab: 'A', tipoDoc: 'APÓLICE', endosso: '' };
  const l = [
    linha({ ...base, tipo: 'N', fim: '2026-10-23', sit: 'Ativa', cli: 'amanhã' }),
    linha({ ...base, tipo: 'R', fim: '2026-10-18', sit: 'Vencida', cli: 'venceu' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Renovada', cli: 'renovada' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Cancelada', cli: 'cancelada' }),
    linha({ ...base, tipo: 'EN', fim: '2026-10-25', sit: 'Ativa', cli: 'endosso' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Ativa', endosso: '3', cli: 'com endosso' }),
    linha({ ...base, tipo: 'N', fim: '2026-11-02', sit: 'Ativa', cli: 'novembro' }),
    linha({ ...base, colab: 'B', tipo: 'N', fim: '2026-10-24', sit: 'Ativa', cli: 'de outro' }),
  ];
  it('regra da 4.2 e ordenação por fim', () => {
    const r = aRenovar(l, new Set(['A']), '2026-10', hoje);
    expect(r.aVencer.map(i => i.cli)).toEqual(['amanhã']);
    expect(r.vencidas.map(i => [i.cli, i.dias, i.faixa])).toEqual([['venceu', -4, 'vencida']]);
    expect(aRenovar(l, new Set(['A']), '2026-11', hoje).aVencer[0]).toMatchObject({ cli: 'novembro', dias: 11, faixa: '15' });
  });
  it('faixas nas bordas', () => {
    expect([-1, 0, 1, 2, 3, 4, 7, 8, 15, 16, 30, 31].map(faixaUrgencia))
      .toEqual(['vencida', '1', '1', '3', '3', '7', '7', '15', '15', '30', '30', 'neutra']);
  });
  it('cores das faixas', () => {
    expect(CORES_FAIXA).toEqual({ vencida: '#7f1d1d', '1': '#FF3B3B', '3': '#FF6B4A', '7': '#F5A623', '15': '#d6c23a', '30': '#7fb3ff', neutra: '#3E4D68' });
  });
  it('navegação de mês na virada de ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12'); expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(mesDe('2026-10-22')).toBe('2026-10');
  });
});
