import { describe, it, expect } from 'vitest';
import { normSit, isApolice, chaveApolice, SIT_DESFECHO_RENOVACAO } from '../../src/domain/situacoes';

describe('situações', () => {
  it('normSit', () => {
    expect(normSit('Perda total')).toBe('Perda Total');
    expect(normSit('  ativa ')).toBe('Ativa');
    expect(normSit('Outra ')).toBe('Outra');
    expect(normSit(undefined)).toBe('');
  });
  it('isApolice', () => {
    expect(isApolice({ endosso: '', tipoDoc: 'APÓLICE' })).toBe(true);
    expect(isApolice({ endosso: '1', tipoDoc: 'APÓLICE' })).toBe(false);
    expect(isApolice({ endosso: '', tipoDoc: 'FATURA' })).toBe(false);
  });
  it('chave e desfechos', () => {
    expect(chaveApolice({ seg: 'X', apolice: '9' })).toBe('X|9');
    expect(SIT_DESFECHO_RENOVACAO).toEqual(['Renovada', 'Vencida']);
  });
});
