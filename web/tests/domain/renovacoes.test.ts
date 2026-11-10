import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import { aplicarAtribuicoes } from '../../src/domain/atribuicoes';
import {
  buscarRenovacoes, cardsRenovacoes, filtrarSituacaoRenov, chegaramParaRenovar, dadosRenovacoes, ligarRenovacoes, periodoRenovacoes, renovacoesDoPeriodo,
} from '../../src/domain/renovacoes';

const NOV = { start: '2026-11-01', end: '2026-11-30' };
const f = (o: Partial<FiltrosGlobais> = {}): FiltrosGlobais => ({ ...FILTROS_VAZIOS, ...o });

// Antiga que vence em novembro e a renovação que começa no fim dela.
const antiga = (o = {}) => linha({ tipo: 'N', vig: '2025-11-10', fim: '2026-11-10', sit: 'Renovada', premio: 1000, com: 150, apolice: 'OLD1', docDigits: '111', ramo: 'Auto', ...o });
const renov = (o = {}) => linha({ tipo: 'R', vig: '2026-11-10', fim: '2027-11-10', sit: 'Ativa', premio: 1100, com: 160, apolice: 'NEW1', docDigits: '111', ramo: 'Auto', ...o });

describe('periodoRenovacoes', () => {
  it('usa a vigência global quando as duas pontas estão preenchidas', () => {
    expect(periodoRenovacoes(f({ vigIni: '2026-11-01', vigFim: '2026-11-30' }), '2026-11-09')).toEqual(NOV);
  });
  it('sem vigência global, o mês corrente inteiro', () => {
    expect(periodoRenovacoes(f(), '2026-02-09')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodoRenovacoes(f({ vigIni: '2026-11-01' }), '2026-11-09')).toEqual(NOV);
  });
});

describe('chegaramParaRenovar', () => {
  it('N e R, só apólices, fim no período, sem Cancelada/Perda Total/Suspensa', () => {
    const l = [
      antiga({ apolice: 'ok-n' }),
      antiga({ apolice: 'ok-r', tipo: 'R', sit: 'Vencida' }),
      antiga({ apolice: 'ok-ativa', sit: 'Ativa', fim: '2026-11-30' }),
      antiga({ apolice: 'endosso', endosso: '1' }),
      antiga({ apolice: 'tipo-en', tipo: 'EN' }),
      antiga({ apolice: 'canc', sit: 'Cancelada' }),
      antiga({ apolice: 'pt', sit: 'Perda Total' }),
      antiga({ apolice: 'susp', sit: 'Suspensa' }),
      antiga({ apolice: 'fora-antes', fim: '2026-10-31' }),
      antiga({ apolice: 'fora-depois', fim: '2026-12-01' }),
    ];
    expect(chegaramParaRenovar(l, f(), NOV).map(r => r.apolice)).toEqual(['ok-n', 'ok-r', 'ok-ativa']);
  });
  it('aplica colaborador, grupo, ramo e seguradora, mas ignora tipo e emissão globais', () => {
    const l = [antiga({ apolice: 'a', colab: 'ANA' }), antiga({ apolice: 'b', colab: 'BIA' })];
    expect(chegaramParaRenovar(l, f({ col: ['ANA'], tipos: ['R'], emIni: '2026-11-01', emFim: '2026-11-30' }), NOV).map(r => r.apolice)).toEqual(['a']);
  });
});

describe('renovacoesDoPeriodo', () => {
  it('apólices R com início de vigência no período, sem Cancelada/Perda Total/Suspensa', () => {
    const l = [
      renov({ apolice: 'r1' }), renov({ apolice: 'r-er', tipo: 'ER' }), renov({ apolice: 'r-n', tipo: 'N' }),
      renov({ apolice: 'r-canc', sit: 'Cancelada' }), renov({ apolice: 'r-fora', vig: '2026-12-01' }), renov({ apolice: 'r-end', endosso: '2' }),
    ];
    expect(renovacoesDoPeriodo(l, f(), NOV).map(r => r.apolice)).toEqual(['r1']);
  });
});

describe('ligarRenovacoes', () => {
  it('liga por CPF/CNPJ + ramo + vigência da R começando no fim da antiga', () => {
    const a = antiga(), r = renov();
    const [item] = ligarRenovacoes([a], [a, r]);
    expect(item.renovacao).toBe(r);
    expect(item.situacao).toBe('renovada');
  });
  it('aceita até 1 dia de diferença entre o fim da antiga e o início da R, não 2', () => {
    const a = antiga();
    expect(ligarRenovacoes([a], [renov({ vig: '2026-11-11' })])[0].renovacao?.vig).toBe('2026-11-11');
    expect(ligarRenovacoes([a], [renov({ vig: '2026-11-09' })])[0].renovacao?.vig).toBe('2026-11-09');
    expect(ligarRenovacoes([a], [renov({ vig: '2026-11-12' })])[0].renovacao).toBeNull();
  });
  it('não liga com outro cliente, outro ramo, tipo N, endosso ou sem CPF/CNPJ', () => {
    const a = antiga();
    for (const r of [renov({ docDigits: '222' }), renov({ ramo: 'Vida' }), renov({ tipo: 'N' }), renov({ endosso: '1' })]) {
      expect(ligarRenovacoes([a], [r])[0].renovacao).toBeNull();
    }
    expect(ligarRenovacoes([antiga({ docDigits: '' })], [renov({ docDigits: '' })])[0].renovacao).toBeNull();
  });
  it('dois carros do mesmo cliente: cada R é usada uma vez, pelo prêmio mais parecido', () => {
    const carro1 = antiga({ apolice: 'C1', premio: 1000 }), carro2 = antiga({ apolice: 'C2', premio: 3000 });
    const r1 = renov({ apolice: 'R1', premio: 1050 }), r2 = renov({ apolice: 'R2', premio: 3200 });
    const itens = ligarRenovacoes([carro1, carro2], [r2, r1]);
    expect(itens.find(i => i.antiga.apolice === 'C1')!.renovacao!.apolice).toBe('R1');
    expect(itens.find(i => i.antiga.apolice === 'C2')!.renovacao!.apolice).toBe('R2');
    // Só uma renovação para dois carros: a outra antiga fica sem ligação.
    const so1 = ligarRenovacoes([carro1, carro2], [r2]);
    expect(so1.filter(i => i.renovacao).map(i => i.antiga.apolice)).toEqual(['C2']);
  });
  it('situação: Renovada (pela planilha ou pela ligação), Vencida, ou Em aberto', () => {
    const itens = ligarRenovacoes([
      antiga({ apolice: 'v', sit: 'Vencida', docDigits: '9' }),
      antiga({ apolice: 'ab', sit: 'Ativa', docDigits: '8' }),
      antiga({ apolice: 'lig', sit: 'Ativa' }),
      antiga({ apolice: 'ren', sit: 'Renovada', docDigits: '7' }),
    ], [renov()]);
    expect(Object.fromEntries(itens.map(i => [i.antiga.apolice, i.situacao]))).toEqual({ v: 'vencida', ab: 'em-aberto', lig: 'renovada', ren: 'renovada' });
  });
  it('ordena por vencimento e depois por cliente', () => {
    const itens = ligarRenovacoes([antiga({ fim: '2026-11-20', cli: 'A' }), antiga({ fim: '2026-11-05', cli: 'Z' }), antiga({ fim: '2026-11-05', cli: 'B' })], []);
    expect(itens.map(i => i.antiga.cli)).toEqual(['B', 'Z', 'A']);
  });
});

describe('cardsRenovacoes', () => {
  it('soma o que chegou para renovar e as renovações do período, com % e o que falta', () => {
    const itens = ligarRenovacoes([
      antiga({ apolice: 'a', sit: 'Renovada', premio: 1000, com: 100, docDigits: '1' }),
      antiga({ apolice: 'b', sit: 'Vencida', premio: 500, com: 50, docDigits: '2' }),
      antiga({ apolice: 'c', sit: 'Ativa', premio: 500, com: 50, docDigits: '3' }),
    ], []);
    const c = cardsRenovacoes(itens, [renov({ premio: 1500, com: 120 })]);
    expect(c.chegaram).toEqual({ premio: 2000, com: 200, qtd: 3 });
    expect(c.renovacoes).toEqual({ premio: 1500, com: 120, qtd: 1 });
    expect(c.pct).toEqual({ premio: 0.75, com: 0.6, qtd: 1 / 3 });
    expect(c.faltam).toEqual({ premio: 500, com: 80, qtd: 2 });
    expect(c.desfecho).toEqual({ renovadas: 1, vencidas: 1, emAberto: 1 });
  });
  it('sem nada para renovar, % é null e nada falta', () => {
    const c = cardsRenovacoes([], [renov()]);
    expect(c.pct).toEqual({ premio: null, com: null, qtd: null });
    expect(c.faltam).toEqual({ premio: 0, com: 0, qtd: 0 });
  });
});

describe('buscarRenovacoes', () => {
  const itens = ligarRenovacoes([
    antiga({ cli: 'José da Silva', docDigits: '12345678900', apolice: 'AP-1', seg: 'Porto', ramo: 'Auto', colab: 'ANA - Equipe' }),
    antiga({ cli: 'Maria Souza', docDigits: '98765432100', apolice: 'AP-2', seg: 'Allianz', ramo: 'Residencial', colab: 'BIA' }),
  ], [renov({ docDigits: '12345678900', apolice: 'NOVA-77' })]);
  const achar = (t: string) => buscarRenovacoes(itens, t).map(i => i.antiga.cli);
  it('vazio devolve tudo', () => expect(achar('  ')).toHaveLength(2));
  it('sem acento e sem diferenciar maiúsculas', () => expect(achar('jose')).toEqual(['José da Silva']));
  it('CPF/CNPJ com ou sem pontuação', () => {
    expect(achar('123.456.789-00')).toEqual(['José da Silva']);
    expect(achar('98765')).toEqual(['Maria Souza']);
  });
  it('apólice antiga ou da renovação, seguradora, ramo e colaborador', () => {
    expect(achar('ap-2')).toEqual(['Maria Souza']);
    expect(achar('nova-77')).toEqual(['José da Silva']);
    expect(achar('allianz')).toEqual(['Maria Souza']);
    expect(achar('resid')).toEqual(['Maria Souza']);
    expect(achar('ana')).toEqual(['José da Silva']);
  });
});

describe('dadosRenovacoes', () => {
  it('junta período, lista ligada e cards com os filtros globais', () => {
    const a = antiga(), r = renov(), outra = antiga({ apolice: 'X', colab: 'OUTRO', docDigits: '5' });
    const d = dadosRenovacoes([a, r, outra], f({ vigIni: '2026-11-01', vigFim: '2026-11-30', col: ['C'] }), '2026-11-09');
    expect(d.periodo).toEqual(NOV);
    expect(d.itens.map(i => i.antiga.apolice)).toEqual(['OLD1']);
    expect(d.itens[0].renovacao).toBe(r);
    expect(d.cards.renovacoes.qtd).toBe(1);
  });
});

describe('filtrarSituacaoRenov', () => {
  const itens = ligarRenovacoes([
    antiga({ apolice: 'v', sit: 'Vencida', docDigits: '9' }),
    antiga({ apolice: 'ab', sit: 'Ativa', docDigits: '8' }),
    antiga({ apolice: 'ren', sit: 'Renovada', docDigits: '7' }),
  ], []);
  const ap = (s: Parameters<typeof filtrarSituacaoRenov>[1]) => filtrarSituacaoRenov(itens, s).map(i => i.antiga.apolice);
  it('vazio devolve todas', () => expect(ap('')).toEqual(['v', 'ab', 'ren']));
  it('filtra por renovada, vencida ou em aberto', () => {
    expect(ap('renovada')).toEqual(['ren']);
    expect(ap('vencida')).toEqual(['v']);
    expect(ap('em-aberto')).toEqual(['ab']);
  });
});

describe('atribuições na aba Renovações', () => {
  // Fictício: OLD1 da ANA atribuída à BIA; a R ligada saiu no nome do CAIO (divergente).
  const at = { seg: 'Allianz', apolice: 'OLD1', fim: '2026-11-10', para: 'BIA', de: 'ANA', por: 'g', em: '2026-11-10T00:00:00Z' };
  const base = () => aplicarAtribuicoes([antiga({ colab: 'ANA' }), renov({ colab: 'CAIO' }), antiga({ apolice: 'OUTRA', colab: 'ANA', docDigits: '5' })], [at]).linhas;
  it('com filtro de colaborador, a antiga atribuída conta para o novo responsável, e a R ligada também', () => {
    const l = base();
    expect(chegaramParaRenovar(l, f({ col: ['BIA'] }), NOV).map(r => r.apolice)).toEqual(['OLD1']);
    expect(chegaramParaRenovar(l, f({ col: ['ANA'] }), NOV).map(r => r.apolice)).toEqual(['OUTRA']);
    expect(renovacoesDoPeriodo(l, f({ col: ['BIA'] }), NOV).map(r => r.apolice)).toEqual(['NEW1']);
    expect(renovacoesDoPeriodo(l, f({ col: ['CAIO'] }), NOV)).toEqual([]);
  });
  it('item divergente quando a R ligada à atribuída saiu no nome de outro, e o filtro de situação "divergente"', () => {
    const d = dadosRenovacoes(base(), f({ vigIni: NOV.start, vigFim: NOV.end }), '2026-11-09');
    const old = d.itens.find(i => i.antiga.apolice === 'OLD1')!;
    expect(old.divergente).toBe(true);
    expect(d.itens.find(i => i.antiga.apolice === 'OUTRA')!.divergente).toBe(false);
    expect(filtrarSituacaoRenov(d.itens, 'divergente').map(i => i.antiga.apolice)).toEqual(['OLD1']);
  });
});

describe('busca com atribuição', () => {
  it('encontra pelo responsável atribuído', () => {
    const at = { seg: 'Allianz', apolice: 'OLD1', fim: '2026-11-10', para: 'ZULEICA', de: 'C', por: 'g', em: '' };
    const itens = ligarRenovacoes(aplicarAtribuicoes([antiga()], [at]).linhas, []);
    expect(buscarRenovacoes(itens, 'zuleica')).toHaveLength(1);
  });
});
