import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import { filtrarLinhas, FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import type { Linha } from '../../src/domain/tipos';
import {
  PERIOD_COLORS, adicionarPeriodo, alternarOrdenacao, buildProdData, cartoesProducao, removerPeriodo,
  resumoExecutivo, rotuloVisao, serieProducao, tabelaProducao, validarPeriodo, type Periodo,
} from '../../src/domain/producao-aba';
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
const fd = (p: Partial<FiltrosGlobais>) => filtrarLinhas(ALL, f(p));
const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();

const textoKpis = (cs: ReturnType<typeof cartoesProducao>['cartoes']) => colapsar(cs.map((c) => c.rotulo + c.valor + c.sub).join(''));
const textoTabela = (t: ReturnType<typeof tabelaProducao>) => colapsar(
  '#' + t.cabecalhos.map((h) => h.rotulo).join('') +
  t.linhas.map((r) => r.posicao + r.nome + r.premio + r.com + r.pctCom + r.ticket + r.qtd + r.pctTotal).join('') +
  'Total geral' + t.total.premio + t.total.com + t.total.pctCom + t.total.ticket + t.total.qtd + '100%');

const casos = (): [string, Linha[]][] => [
  ['producao-padrao', ALL],
  ['producao-vigencia', fd({ vigIni: '2026-01-01', vigFim: '2026-09-30' })],
  ['producao-colab', fd({ col: ['ANA CLARA MENDES'] })],
  ['producao-tipos', fd({ tipos: ['N', 'EN'] })],
  ['producao-ramo-seg', fd({ ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] })],
];

describe('Produção contra os dourados da fixture', () => {
  it.each(['producao-padrao', 'producao-vigencia', 'producao-colab', 'producao-tipos', 'producao-ramo-seg'])('%s: KPIs, selo, tabela (prêmio desc, % pela comissão) e gráfico do ano', (nome) => {
    const linhas = casos().find((c) => c[0] === nome)![1];
    const g = dourado(nome);
    const k = cartoesProducao(linhas, 'colab');
    expect(textoKpis(k.cartoes)).toBe(g.textos['prod-kpi-grid']);
    expect(k.rotuloVisao).toBe(g.textos['prod-kpi-badge']);
    expect(`${linhas.length.toLocaleString('pt-BR')} registros · ${rotuloVisao('colab')}`).toBe(g.textos['prod-view-label']);

    const t = tabelaProducao(linhas, 'colab', 'comissao', 'premio', 'desc');
    expect(textoTabela(t)).toBe(g.textos['prod-table-wrap']);
    expect(t.badge).toBe(g.textos['prod-table-badge']);

    const s = serieProducao(linhas, ALL, [], 'premio', HOJE);
    const gc = g.graficos['ch-prod-line'];
    expect(s.rotulos).toEqual(gc.labels);
    expect(s.datasets.map((d) => d.label)).toEqual(gc.datasets.map((d) => d.label));
    expect(s.datasets.map((d) => d.data)).toEqual(gc.datasets.map((d) => d.data));
    expect(s.legenda.map((l) => l.texto).join('')).toBe(g.textos['period-legend']);
  });

  it('producao-metrica-comissao: gráfico em comissão', () => {
    const g = dourado('producao-metrica-comissao');
    const s = serieProducao(ALL, ALL, [], 'comissao', HOJE);
    expect(s.datasets.map((d) => d.data)).toEqual(g.graficos['ch-prod-line'].datasets.map((d) => d.data));
  });

  it('producao-periodos: dois períodos, rótulos, cores, legenda e séries (sobre ALL, sem filtro de tipo)', () => {
    const g = dourado('producao-periodos');
    let ps: Periodo[] = [];
    ps = adicionarPeriodo(ps, '2026-01-01', '2026-03-31');
    ps = adicionarPeriodo(ps, '2025-07-01', '2025-12-31');
    expect(ps.map((p) => p.label).join('×') + '×').toBe(g.textos['period-tags']);
    expect(ps.map((p) => p.color)).toEqual([PERIOD_COLORS[0], PERIOD_COLORS[1]]);
    const s = serieProducao(ALL, ALL, ps, 'premio', HOJE);
    expect(s.legenda.map((l) => l.texto).join('')).toBe(g.textos['period-legend']);
    expect(s.datasets.map((d) => d.label)).toEqual(g.graficos['ch-prod-line'].datasets.map((d) => d.label));
    expect(s.datasets.map((d) => d.data)).toEqual(g.graficos['ch-prod-line'].datasets.map((d) => d.data));
    expect(s.datasets.map((d) => d.cor)).toEqual(ps.map((p) => p.color));
  });

  it('ordenação: clicar duas vezes em Prêmio volta ao padrão; uma vez inverte; nome começa desc', () => {
    let o = { chave: 'premio', dir: 'desc' as 'asc' | 'desc' };
    o = alternarOrdenacao(o, 'premio');
    expect(o).toEqual({ chave: 'premio', dir: 'asc' });
    expect(textoTabela(tabelaProducao(ALL, 'colab', 'comissao', o.chave, o.dir))).toBe(dourado('producao-ordenacao-asc').textos['prod-table-wrap']);
    o = alternarOrdenacao(o, 'premio');
    expect(o.dir).toBe('desc');
    expect(textoTabela(tabelaProducao(ALL, 'colab', 'comissao', o.chave, o.dir))).toBe(dourado('producao-ordenacao').textos['prod-table-wrap']);
    const n = alternarOrdenacao({ chave: 'premio', dir: 'asc' }, 'nome');
    expect(n).toEqual({ chave: 'nome', dir: 'desc' });
    expect(textoTabela(tabelaProducao(ALL, 'colab', 'comissao', n.chave, n.dir))).toBe(dourado('producao-ordenacao-nome').textos['prod-table-wrap']);
  });

  it('grupo de produção e % de participação pelo prêmio', () => {
    const g = dourado('producao-grupo');
    expect(textoTabela(tabelaProducao(ALL, 'grp', 'comissao', 'premio', 'desc'))).toBe(g.textos['prod-table-wrap']);
    expect(textoKpis(cartoesProducao(ALL, 'grp').cartoes)).toBe(g.textos['prod-kpi-grid']);
    expect(g.textos['prod-kpi-badge']).toBe('Grupo de produção');
    expect(textoTabela(tabelaProducao(ALL, 'colab', 'premio', 'premio', 'desc'))).toBe(dourado('producao-metrica-tabela').textos['prod-table-wrap']);
  });
});

describe('Produção: regras avulsas do main.js', () => {
  it('validação dos períodos, mensagens do alert e limite de 7', () => {
    expect(validarPeriodo([], '', '2026-01-01')).toBe('Selecione data de início e fim.');
    expect(validarPeriodo([], '2026-01-01', '')).toBe('Selecione data de início e fim.');
    expect(validarPeriodo([], '2026-02-01', '2026-01-01')).toBe('Início deve ser anterior ao fim.');
    expect(validarPeriodo([], '2026-01-01', '2026-01-01')).toBeNull();
    const sete = Array.from({ length: 7 }, (_, i) => ({ start: '2026-01-01', end: '2026-01-02', label: String(i), color: PERIOD_COLORS[i] }));
    expect(validarPeriodo(sete, '2026-01-01', '2026-01-02')).toBe('Máximo 7 períodos.');
  });
  it('remover um período recolore pela posição', () => {
    let ps: Periodo[] = [];
    for (const m of ['01', '02', '03']) ps = adicionarPeriodo(ps, `2026-${m}-01`, `2026-${m}-28`);
    ps = removerPeriodo(ps, 0);
    expect(ps.map((p) => p.color)).toEqual([PERIOD_COLORS[0], PERIOD_COLORS[1]]);
    expect(ps[0].label).toBe('Fev/26 → Fev/26');
  });
  it('período filtra por vig em ALL, ignora faturas de saúde e agrupa pelo mês local', () => {
    const rs = [
      linha({ vig: '2026-02-10', premio: 100 }),
      linha({ vig: '2026-02-11', premio: 7, saudeFaturaDe: 'N' }),
      linha({ vig: '2026-04-01', vigLocal: '2026-03-31', premio: 50 }),
      linha({ vig: '2026-05-01', premio: 1000 }),
    ];
    const s = serieProducao([], rs, adicionarPeriodo([], '2026-02-01', '2026-04-30'), 'premio', HOJE);
    expect(s.datasets[0].data.slice(0, 5)).toEqual([0, 100, 50, 0, 0]);
  });
  it('destaque: pontuação 30/40/10/20 e desempate pelo maior ticket; selo "—" sem linhas', () => {
    const rs = [
      linha({ colab: 'A - X', premio: 500, com: 10 }),
      linha({ colab: 'B | Y', premio: 100, com: 50 }), linha({ colab: 'B | Y', premio: 100, com: 50 }),
    ];
    const k = cartoesProducao(rs, 'colab').cartoes;
    expect(k[4].valor).toBe('B |'); // o Destaque só corta em ' - ' (a tabela corta também em '|')
    expect(k[4].sub).toBe('70 pontos'); // maior comissão (.4) + maior % (.1) + maior qtd (.2)
    const vazio = cartoesProducao([], 'colab').cartoes;
    expect(vazio[4]).toMatchObject({ valor: '—', sub: '—' });
    expect(vazio[2].valor.replace(/\s/g, ' ')).toBe('R$ 0,00'); // fBRL(0) não vira '—'
  });
  it('sem identificação e fonte do tamanho do valor', () => {
    const rs = [linha({ colab: '', premio: 1234567.89, com: 1 })];
    expect(buildProdData(rs, 'colab', 'premio')[0].nome).toBe('Sem identificação');
    expect(cartoesProducao(rs, 'colab').cartoes[0].fonte).toBe('15px');
    expect(cartoesProducao([linha({ premio: 1 })], 'colab').cartoes[0].fonte).toBe('20px');
  });
});

describe('Exportar Resumo (exportExecutiveSummary)', () => {
  it('Base_Filtrada com a ordem de chaves do app antigo e Producao_Por_Agente', () => {
    const rs = [linha({ vig: '2026-02-10', em: '', fim: '2027-02-10', cancel: '', colab: 'A', premio: 100, com: 10, vigLocal: '2026-02-09' })];
    const r = resumoExecutivo(rs, 'colab', 'comissao');
    expect(Object.keys(r.baseFiltrada[0])).toEqual([
      'tipo', 'vig', 'em', 'fim', 'cli', 'seg', 'ramo', 'grp', 'premio', 'com', 'colab', 'sit', 'motivo', 'cancel',
      'docDigits', 'tipoPessoa', 'tipoDoc', 'campanha', 'apolice', 'endosso', 'trocaSeg',
    ]);
    expect(r.baseFiltrada[0]).toMatchObject({ vig: '2026-02-10', em: '', cancel: '', trocaSeg: false });
    expect(r.producaoPorAgente).toEqual([{ Nome: 'A', 'Prêmio': 100, 'Comissão': 10, Ticket: 100, Qtd: 1 }]);
    expect(resumoExecutivo([], 'colab', 'comissao')).toEqual({ baseFiltrada: [], producaoPorAgente: [] });
  });
});
