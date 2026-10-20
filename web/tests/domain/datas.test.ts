import { describe, it, expect } from 'vitest';
import { celulaParaISO, addDiasISO, anoISO, mesISO } from '../../src/domain/datas';

describe('celulaParaISO (idêntico em qualquer TZ do processo)', () => {
  it('serial Excel', () => { expect(celulaParaISO(45658)).toBe('2025-01-01'); });
  it('serial com fração (meio-dia) fica no mesmo dia', () => { expect(celulaParaISO(45658.5)).toBe('2025-01-01'); });
  it('string ISO', () => { expect(celulaParaISO('2025-01-01')).toBe('2025-01-01'); });
  it('Date', () => { expect(celulaParaISO(new Date('2025-01-01T03:00:00Z'))).toBe('2025-01-01'); });
  it('vazios e inválidos', () => {
    expect(celulaParaISO('')).toBe('');
    expect(celulaParaISO(null)).toBe('');
    expect(celulaParaISO(0)).toBe('');
    expect(celulaParaISO('lixo')).toBe('');
    expect(celulaParaISO(new Date('x'))).toBe('');
  });
});

describe('aritmética de datas', () => {
  it('addDiasISO atravessa mês, ano e bissexto', () => {
    expect(addDiasISO('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDiasISO('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDiasISO('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDiasISO('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDiasISO('', 5)).toBe('');
  });
  it('ano e mês', () => {
    expect(anoISO('2026-10-15')).toBe(2026);
    expect(mesISO('2026-10-15')).toBe(10);
    expect(mesISO('2026-01-05')).toBe(1);
  });
});

// O app antigo (SheetJS cellDates:true + fmtD) em São Paulo: célula = relógio local; fmtD = dia UTC.
describe('célula com hora (relógio de parede de São Paulo)', () => {
  it('>= 21h vira o dia seguinte (sem horário de verão)', () => {
    expect(celulaParaISO(45658 + 22 / 24)).toBe('2025-01-02');
    expect(celulaParaISO(45658 + 20 / 24)).toBe('2025-01-01');
  });
  it('horário de verão antigo (jan/2018, UTC-2): >= 22h vira o dia seguinte', () => {
    const s = 43101; // 2018-01-01
    expect(celulaParaISO(s + (22 * 60 + 30) / 1440)).toBe('2018-01-02');
    expect(celulaParaISO(s + (21 * 60 + 30) / 1440)).toBe('2018-01-01');
  });
  it('string com hora é hora local de São Paulo', () => {
    expect(celulaParaISO('2025-01-01 22:00:00')).toBe('2025-01-02');
    expect(celulaParaISO('2025-01-01T20:59')).toBe('2025-01-01');
  });
});
