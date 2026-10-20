import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import {
  filtrarLinhas, opcoesFiltros, tiposDisponiveis, FILTROS_VAZIOS, TIPO_LABELS, type FiltrosGlobais,
} from '../../src/domain/filtros';
import type { Linha } from '../../src/domain/tipos';
import { carregarFixture } from './fixture';
import { linha } from './helpers';

const HOJE = '2026-10-15';
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

// Contagem que o app antigo mostra em #rec-badge depois de aplicar o cenário (dourados da fixture).
const recBadge = (cenario: string): number => {
  const g = JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${cenario}.json`), 'utf8'));
  const m = /^([\d.]+) registros$/.exec(g.textos['rec-badge']);
  if (!m) throw new Error(`rec-badge inesperado em ${cenario}: ${g.textos['rec-badge']}`);
  return Number(m[1].replace(/\./g, ''));
};
const f = (p: Partial<FiltrosGlobais>): FiltrosGlobais => ({ ...FILTROS_VAZIOS, ...p });

describe('filtrarLinhas (applyFilters) contra os dourados da fixture', () => {
  it('a base da fixture tem as 437 linhas do cabeçalho antigo', () => {
    expect(ALL).toHaveLength(437);
  });
  it('vigência 2026-01-01..2026-09-30 = producao-vigencia', () => {
    expect(filtrarLinhas(ALL, f({ vigIni: '2026-01-01', vigFim: '2026-09-30' }))).toHaveLength(recBadge('producao-vigencia'));
  });
  it("tipos ['N','EN'] = producao-tipos", () => {
    expect(filtrarLinhas(ALL, f({ tipos: ['N', 'EN'] }))).toHaveLength(recBadge('producao-tipos'));
  });
  it('colaborador ANA CLARA MENDES = producao-colab', () => {
    expect(filtrarLinhas(ALL, f({ col: ['ANA CLARA MENDES'] }))).toHaveLength(recBadge('producao-colab'));
  });
  it('ramo Automóvel - Casco + seguradora Porto Seguro = producao-ramo-seg', () => {
    expect(filtrarLinhas(ALL, f({ ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] }))).toHaveLength(recBadge('producao-ramo-seg'));
  });
  it('vigência + tipos combinados = interseção dos dois recortes', () => {
    const ambos = filtrarLinhas(ALL, f({ vigIni: '2026-01-01', vigFim: '2026-09-30', tipos: ['N', 'EN'] }));
    const naVig = (r: Linha) => !r.vig || (r.vig >= '2026-01-01' && r.vig <= '2026-09-30');
    const tipoOk = (r: Linha) => (r.tipo === 'N' || r.tipo === 'EN') && !(r.saudeFaturaDe && ['N', 'EN'].includes(r.saudeFaturaDe));
    expect(ambos).toEqual(ALL.filter(r => naVig(r) && tipoOk(r)));
    expect(ambos.length).toBeGreaterThan(0);
  });
  it('sem filtro de tipo, a fatura de saúde (saudeFaturaDe) não conta', () => {
    const fatura = ALL.filter(r => r.saudeFaturaDe).length;
    expect(fatura).toBeGreaterThan(0);
    expect(filtrarLinhas(ALL, FILTROS_VAZIOS)).toHaveLength(ALL.length - fatura);
    // só endossos marcados: a fatura passa a contar
    expect(filtrarLinhas(ALL, f({ tipos: ['EN'] })).some(r => r.saudeFaturaDe)).toBe(true);
  });
  it('linha sem data passa no filtro de datas (como no main.js)', () => {
    const rs = [linha({ vig: '', em: '' }), linha({ vig: '2025-01-01', em: '2025-01-01' })];
    expect(filtrarLinhas(rs, f({ vigIni: '2025-06-01', emFim: '2024-01-01' }))).toEqual([rs[0]]);
  });
  it('limites de data são inclusivos', () => {
    const rs = [linha({ vig: '2025-06-01' }), linha({ vig: '2025-06-30' }), linha({ vig: '2025-07-01' })];
    expect(filtrarLinhas(rs, f({ vigIni: '2025-06-01', vigFim: '2025-06-30' }))).toEqual(rs.slice(0, 2));
  });
});

describe('opcoesFiltros (populateFilters / buildColabOptions)', () => {
  it('grupo, ramo e seguradora: valores únicos não vazios em ordem de sort()', () => {
    const o = opcoesFiltros(ALL, FILTROS_VAZIOS);
    const uniq = (k: keyof Linha) => [...new Set(ALL.map(r => r[k] as string).filter(Boolean))].sort();
    expect(o.grp).toEqual(uniq('grp'));
    expect(o.ram).toEqual(uniq('ramo'));
    expect(o.seg).toEqual(uniq('seg'));
    expect(o.ram).toContain('Automóvel - Casco');
    expect(o.seg).toContain('Porto Seguro');
  });
  it('colaborador: só quem tem produção (N, R, EN, ER), sem datas = qualquer período', () => {
    const o = opcoesFiltros(ALL, FILTROS_VAZIOS);
    const esperado = [...new Set(ALL.filter(r => r.colab && ['N', 'R', 'EN', 'ER'].includes(r.tipo)).map(r => r.colab))].sort();
    expect(o.col).toEqual(esperado);
    expect(o.col).toContain('ANA CLARA MENDES');
  });
  it('colaborador: recorta pelas datas e mantém quem já está marcado', () => {
    const rs = [
      linha({ colab: 'A', tipo: 'N', vig: '2025-01-10' }),
      linha({ colab: 'B', tipo: 'R', vig: '2024-01-10' }),
      linha({ colab: 'C', tipo: 'CN', vig: '2025-01-10' }), // cancelamento não é produção
      linha({ colab: 'D', tipo: 'EN', vig: '', em: '' }),   // sem data passa
    ];
    expect(opcoesFiltros(rs, f({ vigIni: '2025-01-01' })).col).toEqual(['A', 'D']);
    expect(opcoesFiltros(rs, f({ vigIni: '2025-01-01', col: ['Z', 'B'] })).col).toEqual(['A', 'B', 'D', 'Z']);
    expect(opcoesFiltros(rs, f({ emIni: '2025-03-01' })).col).toEqual(['D']);
  });
});

describe('tiposDisponiveis (buildTipoBtns)', () => {
  it('tipos únicos ordenados com os rótulos do main.js', () => {
    const t = tiposDisponiveis(ALL);
    expect(t).toEqual([...new Set(ALL.map(r => r.tipo).filter(Boolean))].sort());
    expect(TIPO_LABELS.N).toBe('N — Negócio novo');
    expect(TIPO_LABELS.EN).toBe('EN — Endosso novo');
  });
});
