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

describe('Taxa de churn com a opção soRamosMeta: regra "Só evitável" da aba Retenção', () => {
  // Base (N + R com início em 2025) e renovações R com início em 2026.
  const ap = (o: Parameters<typeof linha>[0]) => linha({ fim: '', ...o });
  const CHURN = [
    ap({ tipo: 'N', vig: '2025-02-01', ramo: 'Automóvel - Casco' }),
    ap({ tipo: 'N', vig: '2025-03-01', ramo: 'Automóvel - Casco', sit: 'Cancelada', motivo: 'Venda do veículo' }), // não evitável
    ap({ tipo: 'N', vig: '2025-04-01', ramo: 'Compreensivo Residencial', sit: 'Cancelada', trocaSeg: true }),   // troca de seguradora
    ap({ tipo: 'N', vig: '2025-05-01', ramo: 'Seguro Viagem Individual' }),                                     // ramo fora da meta
    ap({ tipo: 'R', vig: '2025-06-01', ramo: 'Responsabilidade Civil Geral' }),
    ap({ tipo: 'R', vig: '2026-02-01', ramo: 'Automóvel - Casco' }),
    ap({ tipo: 'R', vig: '2026-05-01', ramo: 'Seguro Viagem Individual' }),
    ap({ tipo: 'R', vig: '2026-06-01', ramo: 'Responsabilidade Civil Geral' }),
  ];
  const churn = (soRamosMeta: boolean) => {
    const d = dadosComp(CHURN, FILTROS_VAZIOS, P);
    return kpisComp(d, dadosKpisComp(CHURN, FILTROS_VAZIOS, d), { soRamosMeta })
      .flatMap((x) => x.cartoes).find((c) => c.rotulo === 'Taxa de churn')!;
  };

  it('desligada: 1 − 3 renovações ÷ 5 N+R do ano anterior', () => {
    expect(churn(false).valor).toBe('40.00%');
    expect(churn(false).foot).toBe('3 renov. ÷ 5 N+R ano ant. · ant. —');
    expect(churn(false).titulo).not.toMatch(/Só evitável/);
  });

  it('ligada: tira ramo fora da meta e cancelamentos não evitáveis (motivo e troca de seguradora) da base e das renovações', () => {
    const c = churn(true);
    expect(c.valor).toBe('0.00%'); // 1 − 2 ÷ 2
    expect(c.foot).toBe('2 renov. ÷ 2 N+R ano ant. · ant. — · só evitável');
    expect(c.titulo).toMatch(/Só evitável, como na aba Retenção/);
  });
});
