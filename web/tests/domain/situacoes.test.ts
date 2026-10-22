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
  it('isApolice: ENDOSSO "0" nas apólices antigas do ERP equivale a vazio (decisão do Mitz, 22/10/2026)', () => {
    expect(isApolice({ endosso: '0', tipoDoc: 'APÓLICE' })).toBe(true);
    expect(isApolice({ endosso: '00', tipoDoc: 'APÓLICE' })).toBe(true);
    // A trava do tipo de documento continua: endosso de verdade com "0" segue fora.
    expect(isApolice({ endosso: '0', tipoDoc: 'ENDOSSO Cancelamento Com Restituição' })).toBe(false);
    // Número de endosso que só começa com zero não é "sem endosso".
    expect(isApolice({ endosso: '01', tipoDoc: 'APÓLICE' })).toBe(false);
    expect(isApolice({ endosso: '10', tipoDoc: 'APÓLICE' })).toBe(false);
  });
  it('chave e desfechos', () => {
    expect(chaveApolice({ seg: 'X', apolice: '9' })).toBe('X|9');
    expect(SIT_DESFECHO_RENOVACAO).toEqual(['Renovada', 'Vencida']);
  });
});
