import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import { dadosRenovacoes, ligarRenovacoes } from '../../src/domain/renovacoes';
import {
  chaveVinculoAntiga, chaveVinculoRen, dentroDaJanela, sugestoesAntiga, sugestoesRenovacao, JANELA_VINCULO_DIAS,
  type VinculoRenovacao,
} from '../../src/domain/vinculos-renovacao';

// Dados fictícios. A1 (ANA, doc 111) vence 2026-11-15; B9 é a R no nome do cônjuge (BRUNO, doc 222).
const f = (o: Partial<FiltrosGlobais> = {}): FiltrosGlobais => ({ ...FILTROS_VAZIOS, ...o });
const NOV = { vigIni: '2026-11-01', vigFim: '2026-11-30' };
const antiga = (o = {}) => linha({ tipo: 'N', seg: 'SegX', apolice: 'A1', vig: '2025-11-15', fim: '2026-11-15', cli: 'ANA EXEMPLO', docDigits: '111', ramo: 'Auto', sit: 'Renovada', premio: 1000, com: 100, ...o });
const renov = (o = {}) => linha({ tipo: 'R', seg: 'SegX', apolice: 'B9', vig: '2026-11-14', fim: '2027-11-14', cli: 'BRUNO EXEMPLO', docDigits: '222', ramo: 'Auto', sit: 'Ativa', premio: 1200, com: 120, ...o });
const vinc = (o: Partial<VinculoRenovacao> = {}): VinculoRenovacao => ({
  seg: 'SegX', apolice: 'A1', fim: '2026-11-15', renSeg: 'SegX', renApolice: 'B9', renVig: '2026-11-14', por: 'g@x', em: '2026-11-13T10:00:00Z', ...o,
});

describe('chaves e janela', () => {
  it('chaves', () => {
    expect(chaveVinculoAntiga(vinc())).toBe('SegX|A1|2026-11-15');
    expect(chaveVinculoRen(vinc())).toBe('SegX|B9|2026-11-14');
  });
  it('janela: até 90 dias depois do fim; antes do fim sem limite', () => {
    expect(JANELA_VINCULO_DIAS).toBe(90);
    expect(dentroDaJanela('2026-11-15', '2027-02-13')).toBe(true); // +90
    expect(dentroDaJanela('2026-11-15', '2027-02-14')).toBe(false); // +91
    expect(dentroDaJanela('2026-11-15', '2026-06-01')).toBe(true);
  });
});

describe('ligação com vínculo manual', () => {
  it('par manual liga antiga e R de CPFs diferentes; R sai de outros e soma no card', () => {
    const a = antiga(), r = renov();
    const sem = dadosRenovacoes([a, r], f(NOV), '2026-11-13');
    expect(sem.itens[0].renovacao).toBeNull();
    expect(sem.outros.map(o => o.renovacao)).toEqual([r]);
    const d = dadosRenovacoes([a, r], f(NOV), '2026-11-13', [vinc()]);
    expect(d.itens[0]).toMatchObject({ renovacao: r, manual: true, situacao: 'renovada' });
    expect(d.outros).toEqual([]);
    expect(d.cards.renovacoes.premio).toBe(1200);
    expect(d.cards.outros.qtd).toBe(0);
  });

  it('ligação automática não é manual', () => {
    const a = antiga(), r = renov({ docDigits: '111' });
    expect(ligarRenovacoes([a], [a, r])[0]).toMatchObject({ renovacao: r, manual: false });
  });

  it('manual vence o automático: a outra antiga fica sem renovação', () => {
    const a = antiga(), c = antiga({ apolice: 'C1', docDigits: '222', cli: 'BRUNO EXEMPLO', fim: '2026-11-14', vig: '2025-11-14' }), r = renov();
    expect(ligarRenovacoes([a, c], [a, c, r]).find(i => i.antiga === c)!.renovacao).toBe(r); // sem vínculo: automático
    const itens = ligarRenovacoes([a, c], [a, c, r], [vinc()]);
    expect(itens.find(i => i.antiga === a)).toMatchObject({ renovacao: r, manual: true });
    expect(itens.find(i => i.antiga === c)!.renovacao).toBeNull();
  });

  it('vínculo com linha sumida é ignorado', () => {
    const a = antiga(), r = renov();
    const itens = ligarRenovacoes([a], [a, r], [vinc({ renApolice: 'NAO-EXISTE' }), vinc({ apolice: 'SUMIU', renApolice: 'B9' })]);
    expect(itens[0].renovacao).toBeNull();
  });

  it('vínculo fora da janela é ignorado; no limite liga', () => {
    const a = antiga();
    const r90 = renov({ vig: '2027-02-13' }), r91 = renov({ apolice: 'B8', vig: '2027-02-14' });
    expect(ligarRenovacoes([a], [a, r91], [vinc({ renApolice: 'B8', renVig: '2027-02-14' })])[0].renovacao).toBeNull();
    expect(ligarRenovacoes([a], [a, r90], [vinc({ renVig: '2027-02-13' })])[0].renovacao).toBe(r90);
  });

  it('vínculo só aceita R (uma N na chave não liga)', () => {
    const a = antiga(), n = renov({ tipo: 'N' });
    expect(ligarRenovacoes([a], [a, n], [vinc()])[0].renovacao).toBeNull();
  });

  it('livres: ligadas (auto ou manual) não aparecem', () => {
    const a = antiga(), r = renov(), a2 = antiga({ apolice: 'A2', docDigits: '333' }), r2 = renov({ apolice: 'B2', docDigits: '444' });
    const d = dadosRenovacoes([a, r, a2, r2], f(NOV), '2026-11-13', [vinc()]);
    expect(d.livres.renovacoes).toEqual([r2]);
    // As R também são antigas candidatas (do ano seguinte); os diálogos filtram por data.
    expect(d.livres.antigas).toContain(a2);
    expect(d.livres.antigas).not.toContain(a);
  });
});

describe('sugestões', () => {
  const a = antiga();
  const mesma = renov({ apolice: 'S1', vig: '2026-12-20' });
  const outraSeg = renov({ apolice: 'S2', seg: 'SegY', vig: '2026-11-15', docDigits: '123456' });
  const perto = renov({ apolice: 'S3', vig: '2026-11-16' });
  const fora = renov({ apolice: 'S4', vig: '2027-03-01' });
  it('mesma seguradora e ramo primeiro, depois a mais próxima; fora da janela nunca', () => {
    expect(sugestoesRenovacao(a, [mesma, outraSeg, perto, fora], '').map(r => r.apolice)).toEqual(['S3', 'S1', 'S2']);
  });
  it('busca por documento com pontuação, nome e nº da apólice', () => {
    expect(sugestoesRenovacao(a, [mesma, outraSeg, perto, fora], '123.456').map(r => r.apolice)).toEqual(['S2']);
    expect(sugestoesRenovacao(a, [mesma, outraSeg, perto, fora], 's1').map(r => r.apolice)).toEqual(['S1']);
    expect(sugestoesRenovacao(a, [mesma, perto], 'bruno').length).toBe(2);
  });
  it('a R precisa começar depois do início da antiga (nunca ela mesma nem uma vigência posterior)', () => {
    const r = renov();
    const atual = renov({ apolice: 'X1', vig: '2026-11-14', fim: '2027-11-14' }); // mesma data de início: não
    const futura = antiga({ apolice: 'X2', vig: '2026-12-01', fim: '2027-12-01' });
    expect(sugestoesAntiga(r, [r, atual, futura], '')).toEqual([]);
    expect(sugestoesRenovacao(antiga(), [antiga({ apolice: 'X3', tipo: 'R', vig: '2025-10-01' })], '')).toEqual([]);
  });
  it('sugestoesAntiga: espelho, a partir da R', () => {
    const r = renov();
    const a2 = antiga({ apolice: 'A2', seg: 'SegY', fim: '2026-11-14' });
    const a3 = antiga({ apolice: 'A3', fim: '2026-10-01' });
    const longe = antiga({ apolice: 'A4', fim: '2026-08-01' }); // R começa 105 dias depois: fora
    expect(sugestoesAntiga(r, [a2, a3, longe, a], '').map(x => x.apolice)).toEqual(['A1', 'A3', 'A2']);
  });
});
