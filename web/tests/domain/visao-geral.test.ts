import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import { filtrarLinhas, FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import type { Linha } from '../../src/domain/tipos';
import {
  cartoesKpi, evolucaoMensal, cancelamentos, concentracaoSeguradora, producaoPorRamo, alternarMotivo, MESES_ROTULOS,
} from '../../src/domain/visao-geral';
import { carregarFixture } from './fixture';
import { linha } from './helpers';

const HOJE = '2026-10-15';
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

type Golden = { textos: Record<string, string>; graficos: Record<string, { labels: string[]; datasets: { label?: string; data: number[] }[] }> };
const dourado = (c: string): Golden => JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${c}.json`), 'utf8'));
const f = (p: Partial<FiltrosGlobais>): FiltrosGlobais => ({ ...FILTROS_VAZIOS, ...p });
const semDatas = (x: FiltrosGlobais) => !x.vigIni && !x.vigFim && !x.emIni && !x.emFim;

// FD que o app antigo teria: padrão = ALL (carga inicial); os demais passam por filtrarLinhas.
const fd = (p: Partial<FiltrosGlobais>) => filtrarLinhas(ALL, f(p));
const casos = (): [string, Linha[], FiltrosGlobais][] => [
  ['visao-geral-padrao', ALL, f({})],
  ['visao-geral-vigencia', fd({ vigIni: '2026-01-01', vigFim: '2026-09-30' }), f({ vigIni: '2026-01-01', vigFim: '2026-09-30' })],
  ['visao-geral-colab', fd({ col: ['ANA CLARA MENDES'] }), f({ col: ['ANA CLARA MENDES'] })],
  ['visao-geral-tipos', fd({ tipos: ['N', 'EN'] }), f({ tipos: ['N', 'EN'] })],
  ['visao-geral-ramo-seg', fd({ ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] }), f({ ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] })],
];

// O dourado vem com espaços colapsados (fBRL usa espaço sem quebra).
const textoKpis = (cs: ReturnType<typeof cartoesKpi>) => cs.map((c) => c.rotulo + c.valor + c.sub).join('').replace(/\s+/g, ' ').trim();
const serie = (g: Golden, id: string) => g.graficos[id];

describe('Visão geral contra os dourados da fixture', () => {
  it.each(['visao-geral-padrao', 'visao-geral-vigencia', 'visao-geral-colab', 'visao-geral-tipos', 'visao-geral-ramo-seg'])('%s: KPIs, evolução, cancelamentos, seguradora e ramo', (nome) => {
    const [, linhas, filtros] = casos().find((c) => c[0] === nome)!;
    const g = dourado(nome);

    expect(textoKpis(cartoesKpi(linhas, HOJE, semDatas(filtros)))).toBe(g.textos['kpi-grid']);

    for (const campo of ['premio'] as const) {
      const ev = evolucaoMensal(linhas, campo, HOJE);
      const gc = serie(g, 'ch-evolucao');
      expect(MESES_ROTULOS).toEqual(gc.labels);
      expect([String(ev.anoAtual), String(ev.anoAnterior)]).toEqual(gc.datasets.map((d) => d.label));
      expect(ev.atual).toEqual(gc.datasets[0].data);
      expect(ev.anterior).toEqual(gc.datasets[1].data);
      expect(ev.variacoes.map((v) => v.txt).join('')).toBe(g.textos['var-bar']);
      expect(g.textos['leg-cur']).toBe(String(ev.anoAtual));
      expect(g.textos['leg-prev']).toBe(String(ev.anoAnterior));
    }

    const cn = cancelamentos(linhas, null);
    const gcn = serie(g, 'ch-cancel');
    expect(`${cn.filtradas} cancelamentos`.replace(/^(\d+)/, (n) => Number(n).toLocaleString('pt-BR'))).toBe(g.textos['cancel-badge']);
    expect(cn.rotulos).toEqual(gcn?.labels ?? []);
    expect(cn.valores).toEqual(gcn?.datasets[0].data ?? []);

    const sg = concentracaoSeguradora(linhas, 'premio');
    expect(sg.rotulos).toEqual(serie(g, 'ch-seg').labels);
    expect(sg.valores).toEqual(serie(g, 'ch-seg').datasets[0].data);
    expect(sg.legenda.map((l) => `${l.rotulo} ${l.pct}`).join('')).toBe(g.textos['seg-legend']);

    const rm = producaoPorRamo(linhas, 'premio');
    expect(rm.rotulos).toEqual(serie(g, 'ch-ramo').labels);
    expect(rm.valores).toEqual(serie(g, 'ch-ramo').datasets[0].data);
  });

  it('comissão nos três gráficos (visao-geral-comissao)', () => {
    const g = dourado('visao-geral-comissao');
    expect(evolucaoMensal(ALL, 'comissao', HOJE).atual).toEqual(serie(g, 'ch-evolucao').datasets[0].data);
    expect(evolucaoMensal(ALL, 'comissao', HOJE).variacoes.map((v) => v.txt).join('')).toBe(g.textos['var-bar']);
    expect(concentracaoSeguradora(ALL, 'comissao').valores).toEqual(serie(g, 'ch-seg').datasets[0].data);
    expect(concentracaoSeguradora(ALL, 'comissao').legenda.map((l) => `${l.rotulo} ${l.pct}`).join('')).toBe(g.textos['seg-legend']);
    expect(producaoPorRamo(ALL, 'comissao').valores).toEqual(serie(g, 'ch-ramo').datasets[0].data);
    expect(producaoPorRamo(ALL, 'comissao').rotulos).toEqual(serie(g, 'ch-ramo').labels);
  });

  it('motivo marcado (visao-geral-motivo): só "Preço"', () => {
    const g = dourado('visao-geral-motivo');
    const cn = cancelamentos(ALL, new Set(['Preço']));
    expect(cn.filtradas).toBe(9);
    expect(g.textos['cancel-badge']).toBe('9 cancelamentos');
    expect(cn.rotulos).toEqual(serie(g, 'ch-cancel').labels);
    expect(cn.valores).toEqual(serie(g, 'ch-cancel').datasets[0].data);
    expect(cn.todos.length).toBe(6); // a lista de motivos continua com todos
  });
});

describe('Visão geral: regras avulsas do main.js', () => {
  it('KPIs sem filtro de data só contam o ano corrente (vig, senão em)', () => {
    const rs = [
      linha({ vig: '2026-02-01', premio: 100, com: 10, cli: 'A' }),
      linha({ vig: '', em: '2026-03-01', premio: 50, com: 5, cli: 'B' }),
      linha({ vig: '2025-12-31', premio: 999, com: 99, cli: 'C' }),
    ];
    const c = cartoesKpi(rs, HOJE, true);
    expect(c[0]).toMatchObject({ rotulo: 'Prêmio total', sub: '2 apólices este ano', cor: 'k-blue' });
    expect(c[4]).toMatchObject({ valor: '2', sub: 'neste ano' });
    expect(cartoesKpi(rs, HOJE, false)[0].sub).toBe('3 apólices');
    expect(cartoesKpi(rs, HOJE, false)[4].sub).toBe('na seleção atual');
  });
  it('Vencendo em 30d: fim entre hoje e hoje+30 inclusive', () => {
    const rs = ['2026-10-14', '2026-10-15', '2026-11-14', '2026-11-15'].map((fim) => linha({ vig: '2026-01-01', fim }));
    expect(cartoesKpi(rs, HOJE, true)[5].valor).toBe('2');
  });
  it('comissão sem prêmio: sub "—"', () => {
    expect(cartoesKpi([], HOJE, false)[1].sub).toBe('—');
  });
  it('variação: "novo" quando só há ano atual, "—" sem nenhum, sinal explícito', () => {
    const ev = evolucaoMensal([
      linha({ vig: '2026-01-10', premio: 200 }), linha({ vig: '2025-01-10', premio: 100 }),
      linha({ vig: '2026-02-10', premio: 50 }), linha({ vig: '2025-03-10', premio: 100 }),
    ], 'premio', HOJE);
    expect(ev.variacoes.slice(0, 4).map((v) => [v.cls, v.txt])).toEqual([
      ['var-pos', '+100.0%'], ['var-pos', 'novo'], ['var-neg', '-100.0%'], ['var-neu', '—'],
    ]);
  });
  it('seguradora: top 8 + Outros e nome abreviado; ramo: top 8', () => {
    const rs = Array.from({ length: 10 }, (_, i) => linha({ seg: `SEG${i} SEGURADORA S/A`, ramo: `R${i}`, premio: 100 - i }));
    const sg = concentracaoSeguradora(rs, 'premio');
    expect(sg.rotulos).toHaveLength(9);
    expect(sg.rotulos[0]).toBe('SEG0');
    expect(sg.rotulos[8]).toBe('Outros');
    expect(sg.valores[8]).toBe(92 + 91);
    expect(producaoPorRamo(rs, 'premio').rotulos).toHaveLength(8);
  });
  it('cancelamentos: rótulo truncado em 40 e altura do gráfico', () => {
    const longo = 'M'.repeat(50);
    const cn = cancelamentos([linha({ sit: 'Cancelada', motivo: longo }), linha({ sit: 'Cancelada', motivo: '' })], null);
    expect(cn.rotulos).toEqual(['M'.repeat(37) + '...', 'Não informado']);
    expect(cn.alturaPx).toBe(Math.max(220, 2 * 38 + 60));
    expect(cancelamentos([], null).alturaPx).toBe(60);
  });
  it('alternarMotivo: desmarcar parte a partir de "todos", e voltar a todos vira null', () => {
    const todos = ['A', 'B', 'C'];
    let sel = alternarMotivo(null, todos, 'B', false);
    expect([...sel!].sort()).toEqual(['A', 'C']);
    sel = alternarMotivo(sel, todos, 'B', true);
    expect(sel).toBeNull();
    expect(alternarMotivo(new Set(), todos, 'A', true)!.size).toBe(1);
  });
});
