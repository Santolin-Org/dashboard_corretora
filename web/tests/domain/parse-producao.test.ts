import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gerarFixture } from '../../parity/fixtures/make-fixture';
import { parseProducao, COL } from '../../src/domain/producao/parse';
import type { Linha } from '../../src/domain/tipos';

let linhas: Linha[];
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'fx-'));
  gerarFixture(dir);
  const b = readFileSync(join(dir, 'producao_2026.xlsx'));
  linhas = parseProducao(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  rmSync(dir, { recursive: true, force: true });
});

describe('parseProducao (fixture)', () => {
  it('lê linhas com datas ISO e trocaSeg inicial', () => {
    expect(linhas.length).toBeGreaterThan(10);
    for (const l of linhas) {
      expect(l.vig).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.trocaSeg).toBe(false);
    }
  });
  it('CNPJ de 15 dígitos vira PJ', () => {
    const pj = linhas.filter(l => l.docDigits.length === 15);
    expect(pj.length).toBeGreaterThan(0);
    expect(pj.every(l => l.tipoPessoa === 'PJ')).toBe(true);
  });
  it('COL literal', () => { expect(COL.vig).toBe('INÍCIO DE VIGÊNCIA'); });
});
