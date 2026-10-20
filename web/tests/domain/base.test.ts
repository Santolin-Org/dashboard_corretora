import { describe, it, expect, beforeAll } from 'vitest';
import { montarBase, prodDedupeKey, contarAtivasVencidas, prodYearRange } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import { linha } from './helpers';
import { carregarFixture } from './fixture';

const HOJE = '2026-10-15';
let fx: ReturnType<typeof carregarFixture>;
beforeAll(() => { fx = carregarFixture(); });

describe('montarBase', () => {
  it('duplicada idêntica entre arquivos conta em duplicadas e fica a do primeiro', () => {
    // o arquivo novo tem < 50% das linhas de 2025 do antigo: a cobertura não age e a dedup é que descarta
    const a = linha({ apolice: 'D1' }), b = { ...a };
    const { linhas, manifesto } = montarBase([
      { nome: 'producao_1.xlsx', linhas: [a, linha({ apolice: 'D2' }), linha({ apolice: 'D3' })], modificadoEm: '2026-01-01T00:00:00Z' },
      { nome: 'producao_2.xlsx', linhas: [b], modificadoEm: '2026-02-01T00:00:00Z' },
    ], null, HOJE);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toBe(a);
    expect(manifesto.map(m => [m.total, m.duplicadas])).toEqual([[3, 0], [1, 1]]);
  });
  it('chave de dedup usa os mesmos campos e ordem do main.js', () => {
    expect(prodDedupeKey(linha({ apolice: 'A', endosso: 'E', premio: 5, com: 1 })))
      .toBe('A|E|APÓLICE|2025-03-01|2025-02-27|Cli|Allianz|Vida|5|1');
  });
  it('ativasVencidas: Ativa com fim anterior a hoje − 15 dias (só apólice)', () => {
    const rs = [
      linha({ fim: '2026-09-29' }), linha({ fim: '2026-09-30' }), linha({ fim: '2026-09-15' }),
      linha({ fim: '2026-09-15', sit: 'Vencida' }), linha({ fim: '2026-09-15', endosso: '1', tipoDoc: 'ENDOSSO' }), linha({ fim: '' }),
    ];
    expect(contarAtivasVencidas(rs, HOJE)).toBe(2); // corte 2026-09-30, estritamente anterior
    const { manifesto } = montarBase([{ nome: 'producao_x.xlsx', linhas: rs, modificadoEm: '2026-10-01T00:00:00Z' }], null, HOJE);
    expect(manifesto[0].ativasVencidas).toBe(2);
    expect(prodYearRange(rs)).toEqual({ min: 2025, max: 2025 });
    expect(prodYearRange([])).toBeNull();
  });
  it('fixture: a cobertura tira de producao_2024 as 11 linhas de 2025 (2026 as cobre); as duplicadas entre arquivos saem na dedup', () => {
    const total = fx.fontes.reduce((a, f) => a + f.linhas.length, 0);
    const { linhas, manifesto } = montarBase(fx.fontes, null, HOJE);
    expect(manifesto[0].anosIgnorados).toEqual([{ ano: 2025, cobertoPor: 'producao_2026.xlsx' }]);
    expect(manifesto[1].anosIgnorados).toEqual([]);
    const dup = manifesto.reduce((a, m) => a + m.duplicadas, 0);
    expect(dup).toBe(2);
    expect(linhas.length).toBe(total - 11 - dup);
  });
  it('fixture: troca de seguradora marca a apólice e o CN', () => {
    const { linhas } = montarBase(fx.fontes, null, HOJE);
    const marcadas = linhas.filter(l => l.trocaSeg);
    expect(marcadas.filter(l => l.apolice === 'AP-TROCA-1').map(l => l.tipo).sort()).toEqual(['CN', 'N']);
    expect(linhas.find(l => l.apolice === 'AP-TROCA-2')!.trocaSeg).toBe(false);
  });
  it('fixture: o saúde recebe prêmio e comissão da planilha (fatura marcada, segundo casa por CPF)', () => {
    const saude = parseSaude(fx.saude!);
    const { linhas, manifesto, avisosSaude } = montarBase(fx.fontes, saude, HOJE);
    const s1 = linhas.find(l => l.apolice === 'SAU-0001' && l.tipo === 'N')!;
    expect(s1).toMatchObject({ premio: 12000, com: 600, saudeManual: true });
    expect(linhas.filter(l => l.apolice === 'SAU-0001' && l.tipo === 'EN').every(l => l.saudeFaturaDe === 'N')).toBe(true);
    const s2 = linhas.filter(l => l.ramo === 'Saúde' && l.apolice === '');
    expect(s2).toHaveLength(1);
    expect(s2[0]).toMatchObject({ premio: 9600, saudeManual: true });
    const m = manifesto[manifesto.length - 1];
    expect(m.nome).toBe('saude_fernando.xlsx');
    expect(m.saude).toMatchObject({ vinculadas: 2, criadas: 0 });
    expect(avisosSaude).toEqual([]);
  });
});
