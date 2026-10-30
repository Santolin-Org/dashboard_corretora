import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { dadosComp, dadosKpisComp, kpisComp } from '../../src/domain/comparativo';
import { FILTROS_VAZIOS } from '../../src/domain/filtros';

// Safra do período (fim de vigência em 2026): Auto renovou, RC geral venceu, Viagem e Carta Verde venceram.
// Safra do ano anterior (fim em 2025): Auto renovou, Viagem venceu.
const safra = (ramo: string, fim: string, sit: string) => linha({ tipo: 'N', ramo, fim, sit, vig: `${+fim.slice(0, 4) - 1}${fim.slice(4)}` });
const TODAS = [
  safra('Automóvel - Casco', '2026-03-10', 'Renovada'),
  safra('Responsabilidade Civil Geral', '2026-04-10', 'Vencida'),
  safra('Seguro Viagem Individual', '2026-05-10', 'Vencida'),
  safra('Carta Verde', '2026-06-10', 'Vencida'),
  safra('Automóvel - Casco', '2025-03-10', 'Renovada'),
  safra('Seguro Viagem Individual', '2025-05-10', 'Vencida'),
];
const P = { start: '2026-01-01', end: '2026-10-29' };
const cartao = (soMeta?: boolean) => {
  const d = dadosComp(TODAS, FILTROS_VAZIOS, P);
  const b = kpisComp(d, dadosKpisComp(TODAS, FILTROS_VAZIOS, d), soMeta === undefined ? undefined : { soRamosMeta: soMeta });
  return b.flatMap((x) => x.cartoes).find((c) => c.rotulo === 'Taxa de renovação')!;
};

describe('Taxa de renovação só com ramos da meta (opção soRamosMeta)', () => {
  it('desligada (padrão): todos os ramos, como no app antigo', () => {
    expect(cartao().valor).toBe('25.00%'); // 1 renovada ÷ 4
    expect(cartao(false)).toEqual(cartao());
    expect(cartao().foot).toBe('1 renov. · 3 venc. · ant. 50.00%');
    expect(cartao().titulo).not.toMatch(/ramos que renovam/);
  });

  it('ligada: tira viagem e carta verde do período e do ano anterior', () => {
    const c = cartao(true);
    expect(c.valor).toBe('50.00%'); // Auto renovou, RC venceu
    expect(c.foot).toBe('1 renov. · 1 venc. · ant. 100.00% · só ramos da meta');
    expect(c.titulo).toMatch(/Só ramos que renovam: os mesmos da meta/);
    expect(c.trendCls).toBe('trend-down'); // 50% contra 100%
  });

  it('ligada e só sobram ramos fora da meta: sem base, mostra —', () => {
    const soViagem = TODAS.filter((r) => r.ramo === 'Seguro Viagem Individual');
    const d = dadosComp(soViagem, FILTROS_VAZIOS, P);
    const c = kpisComp(d, dadosKpisComp(soViagem, FILTROS_VAZIOS, d), { soRamosMeta: true })
      .flatMap((x) => x.cartoes).find((x) => x.rotulo === 'Taxa de renovação')!;
    expect(c.valor).toBe('—');
    expect(c.foot).toBe('nada venceu no período');
  });
});

// Mudou de propósito (30/10/2026): o churn do Comparativo passou a ser canceladas ÷ total de apólices do período.
describe('Taxa de churn: canceladas ÷ total de apólices; com soRamosMeta, regra "Só evitável" da aba Retenção', () => {
  const ap = (o: Parameters<typeof linha>[0]) => linha({ fim: '', ...o });
  const CHURN = [
    // período atual (início de vigência em 2026)
    ap({ tipo: 'N', vig: '2026-02-01', ramo: 'Automóvel - Casco' }),
    ap({ tipo: 'N', vig: '2026-02-05', ramo: 'Automóvel - Casco', sit: 'Cancelada' }),                            // sem motivo: evitável
    ap({ tipo: 'N', vig: '2026-03-01', ramo: 'Automóvel - Casco', sit: 'Cancelada', motivo: 'Venda do veículo' }), // não evitável
    ap({ tipo: 'R', vig: '2026-04-01', ramo: 'Compreensivo Residencial', sit: 'Cancelada', trocaSeg: true }),     // troca de seguradora
    ap({ tipo: 'N', vig: '2026-05-01', ramo: 'Seguro Viagem Individual', sit: 'Cancelada' }),                      // ramo fora da meta
    ap({ tipo: 'R', vig: '2026-06-01', ramo: 'Responsabilidade Civil Geral' }),
    ap({ tipo: 'EN', vig: '2026-06-10', ramo: 'Automóvel - Casco', sit: 'Cancelada', endosso: '1' }),             // endosso: fora
    // período anterior (2025)
    ap({ tipo: 'N', vig: '2025-02-01', ramo: 'Automóvel - Casco', sit: 'Cancelada' }),
    ap({ tipo: 'N', vig: '2025-03-01', ramo: 'Automóvel - Casco', sit: 'Renovada' }),
  ];
  const churn = (soRamosMeta: boolean) => {
    const d = dadosComp(CHURN, FILTROS_VAZIOS, P);
    return kpisComp(d, dadosKpisComp(CHURN, FILTROS_VAZIOS, d), { soRamosMeta })
      .flatMap((x) => x.cartoes).find((c) => c.rotulo === 'Taxa de churn')!;
  };

  it('desligada: 4 canceladas ÷ 6 apólices N e R (endosso fora); anterior 1 ÷ 2', () => {
    const c = churn(false);
    expect(c.valor).toBe('66.67%');
    expect(c.foot).toBe('4 canc. ÷ 6 apólices · ant. 50.00%');
    expect(c.trendCls).toBe('trend-down'); // subiu, e churn menor é melhor
    expect(c.titulo).toMatch(/^Apólices canceladas ÷ total de apólices do período/);
    expect(c.titulo).not.toMatch(/Só evitável/);
  });

  it('ligada: tira ramo fora da meta e cancelamentos não evitáveis (motivo e troca de seguradora) do numerador e do total', () => {
    const c = churn(true);
    expect(c.valor).toBe('33.33%'); // 1 ÷ 3
    expect(c.foot).toBe('1 canc. ÷ 3 apólices · ant. 50.00% · só evitável');
    expect(c.titulo).toMatch(/Só evitável, como na aba Retenção/);
  });

  it('sem apólices no período: —', () => {
    const d = dadosComp([], FILTROS_VAZIOS, P);
    const c = kpisComp(d, dadosKpisComp([], FILTROS_VAZIOS, d)).flatMap((x) => x.cartoes).find((x) => x.rotulo === 'Taxa de churn')!;
    expect(c.valor).toBe('—');
  });
});
