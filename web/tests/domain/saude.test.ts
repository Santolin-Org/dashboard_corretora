import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSaude, parseNumBR } from '../../src/domain/saude/parse';
import { aplicarSaude, saudeFaturaConta, SAUDE_COLAB_PADRAO } from '../../src/domain/saude/aplicar';
import { linha, xlsxBuf } from './helpers';

const CAB = ['APÓLICE', 'CLIENTE', 'CPF/CNPJ', 'SEGURADORA', 'INÍCIO DE VIGÊNCIA', 'TIPO DE NEGÓCIO', 'COLABORADOR', 'PRÊMIO LÍQUIDO', 'AGENCIAMENTO R$', 'COMISSÃO R$', 'TOTAL RECEBIDO'];
const sau = (o = {}) => linha({ ramo: 'Saúde', premio: 0, com: 0, apolice: 'S1', ...o });

describe('parseSaude', () => {
  it('lê valores BR, soma agenciamento + comissão sem total e avisa linha sem valores', () => {
    const p = parseSaude(xlsxBuf(CAB, [
      ['S1', 'Ana', '111.111.111-11', 'Bradesco', '2026-02-01', 'n', '', 'R$ 12.000,50', '360', '240', ''],
      ['S2', 'Bia', '', 'Allianz', '2026-03-01', 'N', '', 0, 0, 0, ''],
      ['', '', '', '', '', '', '', '', '', '', ''],
    ]));
    expect(p.linhas).toHaveLength(1);
    expect(p.linhas[0]).toMatchObject({ linha: 2, apolice: 'S1', docDigits: '11111111111', tipo: 'N', premio: 12000.5, com: 600, vig: '2026-02-01' });
    expect(p.avisos).toEqual(['linha 3 (Bia): sem prêmio nem comissão — ignorada']);
  });
  it('vigMs/emMs: instante do Date antigo (data com formato = serial + 3h; sem formato = serial UTC); ausente sem data', () => {
    const wb = XLSX.utils.aoa_to_sheet([[...CAB, 'DATA EMISSÃO'], ['S1', 'Ana', '', 'B', 0, 'N', '', 100, 0, 0, '', 0]]);
    wb['E2'] = { t: 'n', v: 46054.375, z: 'dd/mm/yyyy' }; // 2026-02-01 09:00 (relógio de SP)
    wb['L2'] = { t: 'n', v: 46054 }; // sem formato de data
    const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, wb, 'P');
    const b = Buffer.from(XLSX.write(w, { type: 'buffer', bookType: 'xlsx' }));
    const l = parseSaude(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).linhas[0];
    expect(l.vigMs).toBe(Date.parse('2026-02-01T12:00:00Z'));
    expect(l.emMs).toBe(Date.parse('2026-02-01T00:00:00Z'));
    const sem = parseSaude(xlsxBuf(CAB, [['S1', 'Ana', '', 'B', '', 'N', '', 100, 0, 0, '']])).linhas[0];
    expect(sem.vigMs).toBeUndefined();
  });
  it('parseNumBR', () => {
    expect([parseNumBR('R$ 1.234,56'), parseNumBR('1234.56'), parseNumBR('2%'), parseNumBR(''), parseNumBR(7)]).toEqual([1234.56, 1234.56, 2, 0, 7]);
  });
});

describe('aplicarSaude', () => {
  it('linha criada leva o instante de vig (ou de em, quando não há vig), como o Date guardado pelo antigo', () => {
    const base = { linha: 2, apolice: 'N1', cli: 'Zed', docDigits: '33333333333', seg: '', vig: '2026-05-04', em: '2026-05-01', fim: '', tipo: 'N', colab: '', grp: '', sit: '', premio: 100, com: 10 };
    const l1: ReturnType<typeof sau>[] = [], l2: ReturnType<typeof sau>[] = [];
    aplicarSaude(l1, { linhas: [{ ...base, vigMs: 111, emMs: 222 }], avisos: [] }, '2026-10-15');
    aplicarSaude(l2, { linhas: [{ ...base, vig: '', vigMs: undefined, emMs: 222 }], avisos: [] }, '2026-10-15');
    expect(l1[0].vigMs).toBe(111);
    expect(l2[0].vigMs).toBe(222);
  });
  it('vincula pela apólice: premio/comissão da planilha, fatura EN marcada, original intacto', () => {
    const orig = sau({ vig: '2026-02-01', fim: '2027-02-01' }), fat = sau({ tipo: 'EN', endosso: '1', tipoDoc: 'ENDOSSO', vig: '2026-03-01', premio: 950 });
    const lin = [orig, fat];
    const r = aplicarSaude(lin, { linhas: [{ linha: 2, apolice: 'S1', cli: 'x', docDigits: '', seg: '', vig: '', em: '', fim: '', tipo: '', colab: '', grp: '', sit: '', premio: 12000, com: 600 }], avisos: ['w'] }, '2026-10-15');
    expect(r).toEqual({ vinculadas: 1, criadas: 0, avisos: ['w'] });
    expect(lin[0]).toMatchObject({ premio: 12000, com: 600, saudeManual: true });
    expect(orig.premio).toBe(0);
    expect(lin[1].saudeFaturaDe).toBe('N');
  });
  it('sem apólice casa por CPF + vigência (até 31 dias); fora disso cria', () => {
    const s = { linha: 2, apolice: '', cli: 'Bia', docDigits: '22222222222', seg: 'Allianz', vig: '2026-05-04', em: '', fim: '', tipo: 'N', colab: '', grp: 'g', sit: '', premio: 9600, com: 480 };
    const a = sau({ apolice: '', docDigits: '22222222222', vig: '2026-05-30' });
    const l1 = [a];
    expect(aplicarSaude(l1, { linhas: [s], avisos: [] }, '2026-10-15').vinculadas).toBe(1);
    const b = sau({ apolice: '', docDigits: '22222222222', vig: '2026-06-10' });
    const l2 = [b];
    expect(aplicarSaude(l2, { linhas: [s], avisos: [] }, '2026-10-15')).toMatchObject({ vinculadas: 0, criadas: 1 });
    expect(l2).toHaveLength(2);
  });
  it('criada: colaborador padrão, fim = vig + 1 ano, situação por hoje; sem vigência vira aviso', () => {
    const base = { linha: 5, apolice: 'Z9', cli: 'Cli', docDigits: '12345678901234', seg: 'S', em: '', fim: '', tipo: 'R', colab: '', grp: '', sit: '', premio: 100, com: 10 };
    const l: ReturnType<typeof sau>[] = [];
    const r = aplicarSaude(l, { linhas: [{ ...base, vig: '2026-02-01' }, { ...base, linha: 6, apolice: 'Z8', vig: '', em: '' }, { ...base, linha: 7, apolice: 'Z7', vig: '2025-01-01' }], avisos: [] }, '2026-10-15');
    expect(l[0]).toMatchObject({ tipo: 'R', ramo: 'Saúde', colab: SAUDE_COLAB_PADRAO, fim: '2027-02-01', sit: 'Ativa', tipoPessoa: 'PJ', em: '2026-02-01', saudeManual: true });
    expect(l[1].sit).toBe('Vencida');
    expect(r.avisos).toEqual(['linha 6: apólice Z8 não está na produção e não tem INÍCIO DE VIGÊNCIA — ignorada']);
  });
});

describe('saudeFaturaConta', () => {
  it('só conta a fatura quando o filtro de tipo deixa passar só endossos', () => {
    expect(saudeFaturaConta({}, new Set(['N']))).toBe(true);
    expect(saudeFaturaConta({ saudeFaturaDe: 'N' }, new Set())).toBe(false);
    expect(saudeFaturaConta({ saudeFaturaDe: 'N' }, new Set(['N']))).toBe(false);
    expect(saudeFaturaConta({ saudeFaturaDe: 'N' }, new Set(['EN']))).toBe(true);
  });
});
