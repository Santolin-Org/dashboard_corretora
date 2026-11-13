import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import type { Linha } from '../../src/domain/tipos';
import { aplicarAtribuicoes, chaveAtribuicao, respDe, tipoMetaDe, type Atribuicao } from '../../src/domain/atribuicoes';

// Nomes e valores fictícios. A1: apólice da ANA, vigência 2025-11-10 → 2026-11-10 (a que chega para renovar).
const v1 = linha({ tipo: 'N', seg: 'SegX', apolice: 'A1', vig: '2024-11-10', fim: '2025-11-10', colab: 'ANA', sit: 'Renovada', docDigits: '111', ramo: 'Auto' });
const v2 = linha({ tipo: 'N', seg: 'SegX', apolice: 'A1', vig: '2025-11-10', fim: '2026-11-10', colab: 'ANA', sit: 'Renovada', docDigits: '111', ramo: 'Auto', premio: 1000 });
const en = linha({ tipo: 'EN', seg: 'SegX', apolice: 'A1', endosso: '1', tipoDoc: 'ENDOSSO', vig: '2026-03-01', fim: '2026-11-10', colab: 'ANA', docDigits: '111', ramo: 'Auto', premio: 50 });
const r = linha({ tipo: 'R', seg: 'SegX', apolice: 'B9', vig: '2026-11-10', fim: '2027-11-10', colab: 'BIA', sit: 'Ativa', docDigits: '111', ramo: 'Auto', premio: 1100 });
const er = linha({ tipo: 'ER', seg: 'SegX', apolice: 'B9', endosso: '1', tipoDoc: 'ENDOSSO', vig: '2027-01-05', fim: '2027-11-10', colab: 'BIA', docDigits: '111', ramo: 'Auto', premio: 30 });
const outra = linha({ apolice: 'Z1', colab: 'CAIO', docDigits: '999' });

const atrib = (o: Partial<Atribuicao> = {}): Atribuicao => ({ seg: 'SegX', apolice: 'A1', fim: '2026-11-10', para: 'BIA', de: 'ANA', por: 'gestor@x', em: '2026-11-10T10:00:00Z', ...o });
const achar = (ls: Linha[], apolice: string, vig: string, tipo?: string) => ls.find(l => l.apolice === apolice && l.vig === vig && (!tipo || l.tipo === tipo))!;

describe('chaveAtribuicao', () => {
  it('seguradora | apólice | fim', () => expect(chaveAtribuicao({ seg: 'S', apolice: 'A', fim: '2026-01-02' })).toBe('S|A|2026-01-02'));
});

describe('aplicarAtribuicoes', () => {
  it('marca a vigência atribuída e seus endossos, não a vigência anterior da mesma apólice', () => {
    const { linhas } = aplicarAtribuicoes([v1, v2, en, outra], [atrib()]);
    const n2 = achar(linhas, 'A1', '2025-11-10'), e = achar(linhas, 'A1', '2026-03-01');
    expect(n2).toMatchObject({ resp: 'BIA', atrib: 'base', tipoEfetivo: 'R', colab: 'ANA' });
    expect(e).toMatchObject({ resp: 'BIA', atrib: 'base', tipoEfetivo: 'ER' });
    expect(achar(linhas, 'A1', '2024-11-10').resp).toBeUndefined();
    expect(linhas.find(l => l.apolice === 'Z1')).toBe(outra);
    // Não altera as linhas de entrada.
    expect(v2.resp).toBeUndefined();
  });

  it('marca a renovação ligada (CPF/CNPJ + ramo + vigência) e o ER dela, sem divergência quando a R está no nome do atribuído', () => {
    const { linhas, divergencias } = aplicarAtribuicoes([v2, r, er], [atrib()]);
    expect(achar(linhas, 'B9', '2026-11-10')).toMatchObject({ resp: 'BIA', atrib: 'renovacao' });
    expect(achar(linhas, 'B9', '2027-01-05')).toMatchObject({ resp: 'BIA', atrib: 'renovacao' });
    expect(achar(linhas, 'B9', '2026-11-10').divergente).toBeFalsy();
    expect(achar(linhas, 'B9', '2026-11-10').tipoEfetivo).toBeUndefined();
    expect(divergencias).toEqual([]);
  });

  it('divergência quando a R saiu no nome de outro colaborador', () => {
    const rCaio = { ...r, colab: 'CAIO' }, erCaio = { ...er, colab: 'CAIO' };
    const { linhas, divergencias } = aplicarAtribuicoes([v2, rCaio, erCaio], [atrib()]);
    expect(achar(linhas, 'B9', '2026-11-10')).toMatchObject({ resp: 'BIA', atrib: 'renovacao', divergente: true });
    expect(achar(linhas, 'B9', '2027-01-05').divergente).toBe(true);
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({ para: 'BIA' });
    expect(divergencias[0].antiga.apolice).toBe('A1');
    expect(divergencias[0].renovacao.colab).toBe('CAIO');
  });

  it('seguradora que mantém o número: a R nova com a mesma apólice é renovação, nunca base', () => {
    const rMesmoNum = { ...r, apolice: 'A1' };
    const { linhas } = aplicarAtribuicoes([v2, rMesmoNum], [atrib()]);
    expect(achar(linhas, 'A1', '2026-11-10', 'R')).toMatchObject({ atrib: 'renovacao', resp: 'BIA' });
    expect(achar(linhas, 'A1', '2026-11-10', 'R').tipoEfetivo).toBeUndefined();
    expect(achar(linhas, 'A1', '2025-11-10', 'N')).toMatchObject({ atrib: 'base' });
  });

  it('atribuição sem linha correspondente é ignorada', () => {
    const entrada = [v2, r];
    const { linhas, divergencias } = aplicarAtribuicoes(entrada, [atrib({ fim: '2026-12-31' })]);
    expect(linhas[0]).toBe(v2);
    expect(linhas[1]).toBe(r);
    expect(divergencias).toEqual([]);
  });

  it('atribuir ao próprio colaborador da planilha não marca nada', () => {
    const { linhas, divergencias } = aplicarAtribuicoes([v2, { ...r, colab: 'CAIO' }], [atrib({ para: 'ANA' })]);
    expect(linhas.every(l => l.resp === undefined)).toBe(true);
    expect(divergencias).toEqual([]);
  });

  it('sem atribuições devolve as mesmas linhas', () => {
    const entrada = [v1, v2];
    expect(aplicarAtribuicoes(entrada, []).linhas).toEqual(entrada);
  });
});

describe('respDe e tipoMetaDe', () => {
  it('caem para colab e tipo sem atribuição', () => {
    expect(respDe(v2)).toBe('ANA');
    expect(tipoMetaDe(v2)).toBe('N');
    expect(respDe({ ...v2, resp: 'BIA' })).toBe('BIA');
    expect(tipoMetaDe({ ...v2, tipoEfetivo: 'R' })).toBe('R');
  });
});

describe('revisão final', () => {
  it('vigências seguidas: a atribuição própria da R vence a marca herdada da antiga', () => {
    // A1 (fim 2026) atribuída à BIA; a renovação B9 (fim 2027) atribuída ao CAIO.
    const { linhas } = aplicarAtribuicoes([v2, r], [atrib(), atrib({ apolice: 'B9', fim: '2027-11-10', para: 'CAIO', de: 'BIA' })]);
    expect(achar(linhas, 'B9', '2026-11-10')).toMatchObject({ resp: 'CAIO', atrib: 'base' });
    expect(achar(linhas, 'B9', '2026-11-10').tipoEfetivo).toBeUndefined();
    expect(achar(linhas, 'A1', '2025-11-10')).toMatchObject({ resp: 'BIA', atrib: 'base' });
  });

  it('dois carros (mesmo CPF e ramo): a ligação é a mesma da lista completa, não só das atribuídas', () => {
    const c1 = linha({ tipo: 'N', seg: 'S', apolice: 'C1', vig: '2025-11-10', fim: '2026-11-10', colab: 'NAT', docDigits: '9', ramo: 'Auto', premio: 1000 });
    const c2 = linha({ tipo: 'N', seg: 'S', apolice: 'C2', vig: '2025-11-10', fim: '2026-11-10', colab: 'NAT', docDigits: '9', ramo: 'Auto', premio: 1040 });
    const r1 = linha({ tipo: 'R', seg: 'S', apolice: 'R1', vig: '2026-11-10', fim: '2027-11-10', colab: 'NAT', docDigits: '9', ramo: 'Auto', premio: 1050 });
    const r2 = linha({ tipo: 'R', seg: 'S', apolice: 'R2', vig: '2026-11-10', fim: '2027-11-10', colab: 'CESAR', docDigits: '9', ramo: 'Auto', premio: 1300 });
    const { linhas, divergencias } = aplicarAtribuicoes([c1, c2, r1, r2], [atrib({ apolice: 'C1', para: 'CESAR', de: 'NAT', seg: 'S' })]);
    // A lista completa liga C2→R1 (|1050−1040| é o par mais próximo) e C1→R2; a atribuição de C1 marca R2.
    expect(achar(linhas, 'R2', '2026-11-10')).toMatchObject({ resp: 'CESAR', atrib: 'renovacao' });
    expect(achar(linhas, 'R1', '2026-11-10').resp).toBeUndefined();
    expect(divergencias).toEqual([]);
  });
});

describe('aplicarAtribuicoes com vínculo manual', () => {
  // R no nome do cônjuge (doc 222): sem vínculo não é ligada à A1.
  const rOutroDoc = linha({ tipo: 'R', seg: 'SegX', apolice: 'C7', vig: '2026-11-12', fim: '2027-11-12', colab: 'CAIO', sit: 'Ativa', docDigits: '222', ramo: 'Auto', premio: 900 });
  const vinc = { seg: 'SegX', apolice: 'A1', fim: '2026-11-10', renSeg: 'SegX', renApolice: 'C7', renVig: '2026-11-12', por: 'g@x', em: '2026-11-13T10:00:00Z' };

  it('atribuição segue a R vinculada à mão', () => {
    expect(achar(aplicarAtribuicoes([v2, rOutroDoc], [atrib()]).linhas, 'C7', '2026-11-12').resp).toBeUndefined();
    const { linhas, divergencias } = aplicarAtribuicoes([v2, rOutroDoc], [atrib()], [vinc]);
    expect(achar(linhas, 'C7', '2026-11-12')).toMatchObject({ resp: 'BIA', atrib: 'renovacao', divergente: true });
    expect(divergencias.map(d => d.renovacao.apolice)).toEqual(['C7']);
  });

  it('vigências seguidas: a R vinculada que é antiga atribuída mantém a marca base', () => {
    const rViraAntiga = linha({ ...rOutroDoc, vig: '2025-11-12', fim: '2026-11-12' });
    const v = { ...vinc, renVig: '2025-11-12' };
    const antigaCedo = linha({ ...v2, vig: '2024-11-10', fim: '2025-11-10' });
    const { linhas } = aplicarAtribuicoes([antigaCedo, rViraAntiga], [atrib({ fim: '2025-11-10' }), atrib({ apolice: 'C7', fim: '2026-11-12', para: 'DORA', de: 'CAIO' })], [{ ...v, fim: '2025-11-10' }]);
    expect(achar(linhas, 'C7', '2025-11-12')).toMatchObject({ resp: 'DORA', atrib: 'base' });
  });
});
