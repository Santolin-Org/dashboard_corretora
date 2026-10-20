import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gerarFixture } from '../../parity/fixtures/make-fixture';
import { parseProducao } from '../../src/domain/producao/parse';
import type { FonteProducao } from '../../src/domain/producao/cobertura';

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
export function carregarFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'fx-'));
  try {
    gerarFixture(dir);
    const nomes = readdirSync(dir);
    const fontes: FonteProducao[] = nomes.filter(n => /^producao.*\.xlsx$/.test(n)).sort((a, b) => a.localeCompare(b))
      .map(nome => ({ nome, linhas: parseProducao(ab(readFileSync(join(dir, nome)))), modificadoEm: '2026-10-14T12:00:00Z' }));
    const ler = (n: string) => existsSync(join(dir, n)) ? ab(readFileSync(join(dir, n))) : null;
    return { fontes, saude: ler('saude_fernando.xlsx'), avisados: ler('sinistrosAvisados.xlsx'), pagamentos: ler('sinistrosPagamentos.xlsx') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
