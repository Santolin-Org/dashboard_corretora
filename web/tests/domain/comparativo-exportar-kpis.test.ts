import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { COMO_CALCULA_KPI, dadosComp, dadosKpisComp, exportacaoKpisComp, kpisComp } from '../../src/domain/comparativo';
import { FILTROS_VAZIOS } from '../../src/domain/filtros';

const P = { start: '2026-01-01', end: '2026-06-30' };
const TODAS = [
  linha({ tipo: 'N', vig: '2026-02-01', premio: 1000.556, com: 100, fim: '' }),
  linha({ tipo: 'R', vig: '2026-03-01', premio: 500, com: 50, fim: '' }),
  linha({ tipo: 'N', vig: '2025-02-01', premio: 800, com: 80, fim: '' }),
];
const planilha = (soMeta = false) => {
  const d = dadosComp(TODAS, FILTROS_VAZIOS, P);
  return exportacaoKpisComp(kpisComp(d, dadosKpisComp(TODAS, FILTROS_VAZIOS, d), { soRamosMeta: soMeta }), d, ['Ramo: Vida'], soMeta);
};
const COL_A = 'Período atual (01/01/2026 → 30/06/2026)', COL_P = 'Período anterior (01/01/2025 → 30/06/2025)';
const linhaDe = (rotulo: string) => planilha().abas[0].linhas.find((l) => l.Indicador === rotulo)!;

describe('exportacaoKpisComp', () => {
  it('uma linha por cartão (16), colunas na ordem, com o período no nome das colunas', () => {
    const x = planilha();
    expect(x.arquivo).toBe('Comparativo_Indicadores_2026-01-01_a_2026-06-30.xlsx');
    expect(x.abas[0].cabecalho).toEqual(['Bloco', 'Indicador', 'Unidade', COL_A, COL_P, 'Diferença', 'Variação %', 'Observação', 'Como é calculado']);
    expect(x.abas[0].linhas).toHaveLength(16);
  });

  it('valores numéricos: R$ com 2 casas, contagem inteira, percentual em pontos e diferença em p.p.', () => {
    const premio = linhaDe('Prêmio total');
    expect(premio).toMatchObject({ Bloco: 'Resultado do período', Unidade: 'R$', [COL_A]: 1500.56, [COL_P]: 800, 'Diferença': 700.56, 'Variação %': 87.6 });
    expect(linhaDe('Apólices')).toMatchObject({ Unidade: 'quantidade', [COL_A]: 2, [COL_P]: 1, 'Diferença': 1, 'Variação %': 100 });
    const mix = linhaDe('Mix novo'); // 1000.556 / 1500.556 contra 800 / 800
    expect(mix.Unidade).toBe('% (diferença em p.p.)');
    expect(mix[COL_A]).toBe(66.68);
    expect(mix[COL_P]).toBe(100);
    expect(mix['Diferença']).toBe(-33.32);
  });

  it('sem base (cartão com —): células vazias, sem diferença nem variação', () => {
    const t = linhaDe('Taxa de renovação');
    expect(t).toMatchObject({ [COL_A]: '', [COL_P]: '', 'Diferença': '', 'Variação %': '', 'Observação': 'nada venceu no período' });
  });

  it('anterior zero: diferença sim, variação % vazia', () => {
    const r = linhaDe('Prêmio renovação');
    expect(r).toMatchObject({ [COL_A]: 500, [COL_P]: 0, 'Diferença': 500, 'Variação %': '' });
  });

  it('"Como é calculado": todo cartão tem explicação; renovação e churn trazem a dica do cartão', () => {
    for (const l of planilha().abas[0].linhas) expect(String(l['Como é calculado']).length).toBeGreaterThan(10);
    expect(Object.keys(COMO_CALCULA_KPI)).toHaveLength(14);
    expect(linhaDe('Taxa de churn')['Como é calculado']).toMatch(/^Apólices canceladas ÷ total de apólices/);
    expect(planilha(true).abas[0].linhas.find((l) => l.Indicador === 'Taxa de churn')!['Como é calculado']).toMatch(/Só evitável/);
  });

  it('aba Recorte: períodos, filtros e a opção de renovação/churn', () => {
    expect(planilha().abas[1].linhas).toEqual([
      { Item: 'Período atual', Valor: '01/01/2026 → 30/06/2026 (início de vigência)' },
      { Item: 'Período anterior', Valor: '01/01/2025 → 30/06/2025' },
      { Item: 'Filtros', Valor: 'Ramo: Vida' },
      { Item: 'Renovação e churn', Valor: 'Todos os ramos e motivos' },
    ]);
    expect(planilha(true).abas[1].linhas[3].Valor).toBe('Só ramos da meta; churn só evitável');
  });
});
