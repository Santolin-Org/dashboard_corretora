import { describe, it, expect } from 'vitest';
import { canonRamo, classifyRamo, metaTipoSide, shortRamo, normRamo } from '../../src/domain/ramos';
import { fBRL, fN, fP, fPct, fShort } from '../../src/domain/formatos';

const nb = (s: string) => s.replace(/ /g, ' ');

describe('ramos', () => {
  it('canonRamo unifica caixa/acento', () => {
    expect(canonRamo('ODONTOLÓGICO - COLETIVO')).toBe(canonRamo('Odontológico - Coletivo'));
    expect(canonRamo('Ramo Novo ')).toBe('Ramo Novo');
  });
  it('classifyRamo', () => {
    expect(classifyRamo('Vida em Grupo')).toBe('pessoais');
    expect(classifyRamo('Seguro Viagem Individual')).toBe('excluded');
    expect(classifyRamo('Automóvel - Casco')).toBe('patrimoniais');
  });
  it('metaTipoSide', () => {
    expect(metaTipoSide('EN')).toBe('N'); expect(metaTipoSide('ER')).toBe('R'); expect(metaTipoSide('CN')).toBeNull();
  });
  it('normRamo e shortRamo', () => {
    expect(normRamo(' Saúde  ')).toBe('SAUDE');
    expect(shortRamo('Automóvel - Casco')).toBe('Auto — casco');
    expect(shortRamo('SAÚDE')).toBe('Saúde');
  });
});

describe('formatos', () => {
  it('fBRL e demais', () => {
    expect(nb(fBRL(1234.5))).toBe('R$ 1.234,50');
    expect(fBRL(0)).toContain('0,00');
    expect(fBRL(null as unknown as number)).toBe('—');
    expect(fN(1234.6)).toBe('1.235');
    expect(fP(0.1234)).toBe('12.34%');
    expect(fPct(null)).toBe('—');
    expect(fShort(1500000)).toBe('R$1.50M');
    expect(fShort(2500)).toBe('R$2.50k');
    expect(fShort(99.6)).toBe('R$100');
  });
});
