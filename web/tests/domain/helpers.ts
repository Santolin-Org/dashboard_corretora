import * as XLSX from 'xlsx';
import type { Linha } from '../../src/domain/tipos';

export function linha(o: Partial<Linha> = {}): Linha {
  return {
    tipo: 'N', vig: '2025-03-01', em: '2025-02-27', fim: '2026-03-01', cli: 'Cli', seg: 'Allianz', ramo: 'Vida', grp: 'G',
    premio: 100, com: 10, colab: 'C', sit: 'Ativa', motivo: '', cancel: '', docDigits: '11111111111', tipoPessoa: 'PF',
    tipoDoc: 'APÓLICE', campanha: '', apolice: 'A1', endosso: '', trocaSeg: false, ...o,
  };
}
export function xlsxBuf(cab: string[], linhas: (string | number)[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), 'P');
  const b = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
