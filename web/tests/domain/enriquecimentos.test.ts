import { describe, it, expect } from 'vitest';
import { applyMotivoEndosso, applyTrocaSeguradora } from '../../src/domain/producao/enriquecimentos';
import { linha } from './helpers';

describe('applyMotivoEndosso', () => {
  it('motivo do CN sobrescreve o da apólice-mãe; vale o endosso mais recente', () => {
    const mae = linha({ apolice: 'P1', motivo: 'antigo', sit: 'cancelada' });
    const cn1 = linha({ tipo: 'CN', apolice: 'P1', endosso: '1', tipoDoc: 'ENDOSSO', motivo: ' Preço ', cancel: '2025-06-01' });
    const cn2 = linha({ tipo: 'CN', apolice: 'P1', endosso: '2', tipoDoc: 'ENDOSSO', motivo: 'Sinistro', cancel: '2025-07-01' });
    const outraCia = linha({ apolice: 'P1', seg: 'Porto', motivo: 'fica' });
    applyMotivoEndosso([mae, cn1, cn2, outraCia]);
    expect(mae.motivo).toBe('Sinistro');
    expect(mae.sit).toBe('Cancelada'); // normaliza a situação
    expect(outraCia.motivo).toBe('fica');
    expect(cn1.motivo).toBe(' Preço '); // endossos não mudam
  });
  it('sem endosso com motivo, a apólice mantém o seu', () => {
    const mae = linha({ motivo: 'meu' });
    applyMotivoEndosso([mae, linha({ tipo: 'CN', endosso: '1', tipoDoc: 'ENDOSSO', motivo: '  ' })]);
    expect(mae.motivo).toBe('meu');
  });
});

describe('applyTrocaSeguradora', () => {
  const cenario = () => {
    const a = linha({ apolice: 'A', seg: 'Porto', sit: 'Cancelada', cancel: '2026-06-20', vig: '2026-01-10', fim: '2027-01-10', ramo: 'Automóvel - Casco' });
    const cn = linha({ tipo: 'CN', apolice: 'A', seg: 'Porto', endosso: '1', tipoDoc: 'ENDOSSO', sit: 'Cancelada', cancel: '2026-06-20', vig: '2026-06-20', ramo: 'Automóvel - Casco' });
    const b = linha({ tipo: 'R', apolice: 'B', seg: 'Tokio', vig: '2026-06-12', fim: '2027-06-12', ramo: 'Automóvel - Casco' });
    return { a, cn, b };
  };
  it('marca trocaSeg na apólice cancelada e no CN dela', () => {
    const { a, cn, b } = cenario();
    applyTrocaSeguradora([a, cn, b], '2026-10-15');
    expect([a.trocaSeg, cn.trocaSeg, b.trocaSeg]).toEqual([true, true, false]);
  });
  it('sem a nova apólice é churn: não marca', () => {
    const { a, cn } = cenario();
    applyTrocaSeguradora([a, cn], '2026-10-15');
    expect([a.trocaSeg, cn.trocaSeg]).toEqual([false, false]);
  });
  it('limites: nova apólice já em vigor 15 dias antes não é troca; nascida depois dessa data é', () => {
    const { a, b } = cenario();
    b.vig = '2026-06-05'; // já em vigor em t0 (20/06 − 15): o saldo "antes" já tinha as duas
    applyTrocaSeguradora([a, b], '2026-10-15');
    expect(a.trocaSeg).toBe(false);
    const c = cenario();
    c.b.vig = '2026-06-06';
    applyTrocaSeguradora([c.a, c.b], '2026-10-15');
    expect(c.a.trocaSeg).toBe(true);
  });
  it('depois = hoje quando os 90 dias ainda não passaram', () => {
    const { a, b } = cenario();
    b.vig = '2026-06-22';
    applyTrocaSeguradora([a, b], '2026-06-25');
    expect(a.trocaSeg).toBe(true);
    b.vig = '2026-07-01'; // ainda não nasceu em "hoje": a troca pode não ter acontecido
    applyTrocaSeguradora([a, b], '2026-06-25');
    expect(a.trocaSeg).toBe(false);
  });
});
