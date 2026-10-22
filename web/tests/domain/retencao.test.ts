import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import {
  FILTROS_RET_INICIAIS, ORDEM_RET_INICIAL, RET_DETAIL_PAGE_SIZE, alternarOrdemRet, exportacaoChurn, exportacaoDetalhe, fmtRetPeriodo,
  getRetData, getRetDetailRows, graficosRetencao, isCancelNaoEvitavel, isChurnBase, isChurnPerda, kpisRetencao, opcoesRetencao,
  periodoPadraoRet, tabelaChurn, tabelaDetalhe, type FiltrosRetencao, type FiltroDetalhe, type OrdemRet, type PeriodoRet, type VisaoRet,
} from '../../src/domain/retencao';
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
const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();
const F = (p: Partial<FiltrosRetencao>): FiltrosRetencao => ({ ...FILTROS_RET_INICIAIS, ...p });

type Caso = { f: FiltrosRetencao; p?: PeriodoRet; visao?: VisaoRet; ordem?: OrdemRet; sit?: FiltroDetalhe };
const PADRAO = periodoPadraoRet(HOJE);
const CASOS: Record<string, Caso> = {
  'retencao-padrao': { f: F({}) },
  'retencao-vigencia': { f: F({}) }, // filtros globais não valem na aba (usa ALL)
  'retencao-colab': { f: F({}) },
  'retencao-tipos': { f: F({}) },
  'retencao-ramo-seg': { f: F({}) },
  'retencao-periodo': { f: F({}), p: { s: '2026-04-01', e: '2026-09-30' } },
  'retencao-vazio': { f: F({}), p: { s: '2030-01-01', e: '2030-12-31' } },
  'retencao-so-evitavel-off': { f: F({ soEvitavel: false }) },
  'retencao-detalhe-busca': { f: F({}), sit: 'Cancelada' },
  'retencao-detalhe-vencidas': { f: F({}), sit: 'Vencida' },
  'retencao-motivo': { f: F({ mot: ['Insatisfação com atendimento'] }) },
  'retencao-filtros-proprios': { f: F({ col: ['CARLA NOGUEIRA'], ram: ['Responsabilidade Civil Geral'], tipos: ['R'] }) },
  'retencao-grupo': { f: F({}), visao: 'grp' },
  'retencao-ordenacao': { f: F({}), ordem: { chave: 'nome', dir: 'desc' } },
  'retencao-todos-evitaveis-canc': { f: F({ soEvitavel: false, tipos: ['N'] }), sit: 'Cancelada' },
};

// Templates do antigo: células separadas por espaço (o dourado vem com espaços colapsados).
const badge = (b: { texto: string }) => b.texto;
const textoKpis = (k: ReturnType<typeof kpisRetencao>) => colapsar(k.blocos.map(b => b.titulo + b.cartoes.map(c => c.rotulo + c.valor + c.sub).join('')).join(''));
const textoTabela = (t: ReturnType<typeof tabelaChurn>) => colapsar(
  t.cabecalhos.map(h => h.rotulo).join(' ') + ' ' +
  t.linhas.map(r => [r.nome, r.qtdBase, r.qtdCancel, badge(r.pctQtd), r.premioBase, r.premioCancel, badge(r.pctPremio), r.comPerdida, badge(r.pctCom), r.canceladas, badge(r.pctCanc), r.vencidas].join(' ')).join(' ') + ' Total ' +
  [t.total.qtdBase, t.total.qtdCancel, badge(t.total.pctQtd), t.total.premioBase, t.total.premioCancel, badge(t.total.pctPremio), t.total.comPerdida, badge(t.total.pctCom), t.total.canceladas, badge(t.total.pctCanc), t.total.vencidas].join(' '));
const textoDetalhe = (d: ReturnType<typeof tabelaDetalhe>) => d.total === 0 ? 'Nenhuma apólice perdida no período com os filtros atuais.' : colapsar(
  'Tipo Cliente Ramo Seguradora Colaborador Situação Motivo Prêmio Comissão Vigência Saída ' +
  d.linhas.map(r => [r.tipo, r.cli, r.ramo, r.seg, r.colab, r.sit, r.motivo, r.premio, r.com, r.vig, r.saida].join(' ')).join(' '));

describe('Retenção contra os dourados da fixture', () => {
  it.each(Object.keys(CASOS))('%s: selos, KPIs, gráficos, tabela por produtor e detalhe', (nome) => {
    const c = CASOS[nome], g = dourado(nome), p = c.p ?? PADRAO, visao = c.visao ?? 'colab';
    const k = kpisRetencao(ALL, c.f, p);
    expect(k.badge).toBe(g.textos['ret-kpi-badge']);
    expect(textoKpis(k)).toBe(g.textos['ret-kpi-grid']);

    const gr = graficosRetencao(ALL, c.f, p, HOJE);
    expect(gr.badgeCancel).toBe(g.textos['ret-cancel-badge']);
    const gc = g.graficos['ch-ret-cancel'];
    if (gr.cancel) { expect(gr.cancel.labels).toEqual(gc.labels); expect([gr.cancel.data]).toEqual(gc.datasets.map(d => d.data)); } else expect(gc).toBeUndefined();
    const ge = g.graficos['ch-ret-evolucao'];
    expect(gr.evolucao.labels).toEqual(ge.labels);
    expect([gr.evolucao.canceladas, gr.evolucao.vencidas]).toEqual(ge.datasets.map(d => d.data));
    expect(ge.datasets.map(d => d.label)).toEqual(['Canceladas', 'Vencidas']);

    const t = tabelaChurn(ALL, c.f, p, visao, c.ordem ?? ORDEM_RET_INICIAL);
    expect(t.badge).toBe(g.textos['ret-prod-badge']);
    expect(textoTabela(t)).toBe(g.textos['ret-prod-table-wrap']);

    const rows = getRetDetailRows(ALL, c.f, p, c.sit ?? '');
    const d = tabelaDetalhe(rows, 1);
    expect(d.badge).toBe(g.textos['ret-detail-badge']);
    expect(textoDetalhe(d)).toBe(g.textos['ret-detail-wrap']);
    expect(`${(d.inicio + 1).toLocaleString('pt-BR')}–${(d.inicio + d.naPagina).toLocaleString('pt-BR')} de ${d.total.toLocaleString('pt-BR')}`).toBe(g.textos['ret-detail-pagination'].split(' ← ')[0]);
  });

  it('o selo do período vem de fmtRetPeriodo e o padrão é 1º de janeiro até hoje', () => {
    expect(periodoPadraoRet(HOJE)).toEqual({ s: '2026-01-01', e: HOJE });
    expect(fmtRetPeriodo({ s: '2026-04-01', e: '2026-09-30' })).toBe(dourado('retencao-periodo').textos['ret-kpi-badge'].replace(' · só evitável', ''));
    expect(fmtRetPeriodo({ s: '', e: '' })).toBe('todo o histórico');
    expect(fmtRetPeriodo({ s: '2026-01-02', e: '' })).toBe('desde 02/01/2026');
    expect(fmtRetPeriodo({ s: '', e: '2026-01-02' })).toBe('até 02/01/2026');
  });

  it('opções dos seletores: colaborador, ramo, grupo e motivo (dourado)', () => {
    const g = dourado('retencao-padrao');
    const o = opcoesRetencao(ALL, PADRAO, []);
    expect(colapsar(`Todos▼${o.col.join('')}Marcar todosLimpar`)).toBe(g.textos['ms-ret-col']);
    expect(colapsar(`Todos▼${o.ram.join('')}Marcar todosLimpar`)).toBe(g.textos['ms-ret-ram']);
    expect(colapsar(`Todos▼${o.grp.join('')}Marcar todosLimpar`)).toBe(g.textos['ms-ret-grp']);
    expect(colapsar(`Todos▼${o.mot.join('')}Marcar todosLimpar`)).toBe(g.textos['ms-ret-mot']);
  });

  it('exportação do detalhe: um registro por perdida, no filtro de situação', () => {
    const p = PADRAO;
    const todas = exportacaoDetalhe(getRetDetailRows(ALL, F({}), p, ''));
    const canc = exportacaoDetalhe(getRetDetailRows(ALL, F({}), p, 'Cancelada'));
    expect(todas.length).toBe(23);
    expect(canc.length).toBe(3);
    expect(Object.keys(todas[0])).toEqual(['Tipo', 'Cliente', 'Ramo', 'Seguradora', 'Colaborador', 'Situação', 'Motivo', 'Prêmio', 'Comissão', 'Vigência', 'Saída']);
    expect(todas.filter(r => r['Situação'] === 'Vencida').every(r => r['Motivo'] === '-')).toBe(true);
  });

  it('exportação do churn: uma linha por produtor, sem a ordenação da tela', () => {
    const e = exportacaoChurn(ALL, F({}), PADRAO, 'colab');
    expect(e.length).toBe(5);
    expect(e[0]['Período']).toBe('01/01/2026 a 15/10/2026');
    expect(e[0]['Churn']).toBe('Só evitável');
    expect(exportacaoChurn(ALL, F({ soEvitavel: false }), PADRAO, 'grp')[0]['Churn']).toBe('Todos os motivos');
    expect(Object.keys(e[0])).toHaveLength(17);
  });
});

describe('regras de churn (METRICAS.md)', () => {
  const p: PeriodoRet = { s: '2026-01-01', e: '2026-06-30' };
  const base = { tipo: 'N', tipoDoc: 'APÓLICE', endosso: '', sit: 'Ativa', vig: '2026-02-01', fim: '2027-02-01' };

  it('base: só apólice N/R em vigor no período; endosso, Suspensa e Perda Total ficam fora', () => {
    expect(isChurnBase(linha(base), p)).toBe(true);
    expect(isChurnBase(linha({ ...base, endosso: '1' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, tipo: 'EN' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, sit: 'Suspensa' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, sit: 'Perda Total' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, vig: '2026-07-01' }), p)).toBe(false); // começou depois do período
    expect(isChurnBase(linha({ ...base, vig: '2025-01-01', fim: '2025-12-31' }), p)).toBe(false); // saiu antes
  });
  it('Renovada só entra na base se o término cai depois do fim do período (a sucessora já está na base)', () => {
    expect(isChurnBase(linha({ ...base, sit: 'Renovada', fim: '2026-05-01' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, sit: 'Renovada', fim: '2026-06-30' }), p)).toBe(false);
    expect(isChurnBase(linha({ ...base, sit: 'Renovada', fim: '2026-08-01' }), p)).toBe(true);
    expect(isChurnBase(linha({ ...base, sit: 'Renovada', fim: '2026-08-01' }), { s: '2026-01-01', e: '' })).toBe(false); // sem fim: sempre a sucessora
  });
  it('perda: Cancelada pela data de cancelamento (sem ela, pelo término) e Vencida pelo término, dentro do período', () => {
    expect(isChurnPerdaCom({ ...base, sit: 'Cancelada', cancel: '2026-03-10', fim: '2027-02-01' })).toBe(true);
    expect(isChurnPerdaCom({ ...base, sit: 'Cancelada', cancel: '2026-08-10', fim: '2027-02-01' })).toBe(false); // retida neste período
    expect(isChurnPerdaCom({ ...base, sit: 'Cancelada', cancel: '', fim: '2026-04-01' })).toBe(true);
    expect(isChurnPerdaCom({ ...base, sit: 'Vencida', fim: '2026-04-01' })).toBe(true);
    expect(isChurnPerdaCom({ ...base, sit: 'Vencida', fim: '2026-09-01' })).toBe(false);
    expect(isChurnPerdaCom({ ...base, sit: 'Ativa', fim: '2026-04-01' })).toBe(false);
  });
  const isChurnPerdaCom = (o: Partial<Linha>) => isChurnPerda(linha(o), p);

  it('cancelamento não evitável: pelo motivo (sem acento/caixa) ou por troca de seguradora; sem motivo é evitável', () => {
    expect(isCancelNaoEvitavel(linha({ sit: 'Cancelada', motivo: 'Venda do veículo' }))).toBe(true);
    expect(isCancelNaoEvitavel(linha({ sit: 'Cancelada', motivo: 'FALECIDO' }))).toBe(true);
    expect(isCancelNaoEvitavel(linha({ sit: 'Cancelada', motivo: 'Preço' }))).toBe(false);
    expect(isCancelNaoEvitavel(linha({ sit: 'Cancelada', motivo: '' }))).toBe(false);
    expect(isCancelNaoEvitavel(linha({ sit: 'Cancelada', motivo: 'Preço', trocaSeg: true }))).toBe(true);
    expect(isCancelNaoEvitavel(linha({ sit: 'Ativa', tipo: 'CN', motivo: 'Perda total' }))).toBe(true); // endosso CN/CR
    expect(isCancelNaoEvitavel(linha({ sit: 'Vencida', motivo: 'Perda total' }))).toBe(false);
  });

  it('getRetData: ramo fora da meta sai sempre; "só evitável" tira o não evitável; motivo só filtra cancelamentos', () => {
    const ls = [
      linha({ ramo: 'Viagem' }),
      linha({ sit: 'Cancelada', motivo: 'Venda do imóvel', apolice: 'B' }),
      linha({ sit: 'Cancelada', motivo: 'Preço', apolice: 'C' }),
      linha({ sit: 'Vencida', apolice: 'D' }),
    ];
    expect(getRetData(ls, F({})).map(r => r.apolice)).toEqual(['C', 'D']);
    expect(getRetData(ls, F({ soEvitavel: false })).map(r => r.apolice)).toEqual(['B', 'C', 'D']);
    expect(getRetData(ls, F({}), true).map(r => r.apolice)).toEqual(['B', 'C', 'D']);
    expect(getRetData(ls, F({ soEvitavel: false, mot: ['Preço'] })).map(r => r.apolice)).toEqual(['C', 'D']);
  });
});

describe('interações da tela', () => {
  it('ordenação: a mesma coluna inverte, coluna nova começa em desc', () => {
    expect(ORDEM_RET_INICIAL).toEqual({ chave: 'pctQtd', dir: 'desc' });
    expect(alternarOrdemRet(ORDEM_RET_INICIAL, 'pctQtd')).toEqual({ chave: 'pctQtd', dir: 'asc' });
    expect(alternarOrdemRet({ chave: 'pctQtd', dir: 'asc' }, 'nome')).toEqual({ chave: 'nome', dir: 'desc' });
  });
  it('detalhe: páginas de 50, página limitada ao intervalo e "1–0 de 0" sem registros', () => {
    const rows = Array.from({ length: 120 }, (_, i) => linha({ apolice: String(i) }));
    expect(RET_DETAIL_PAGE_SIZE).toBe(50);
    const d3 = tabelaDetalhe(rows, 3);
    expect([d3.pagina, d3.totalPaginas, d3.inicio, d3.naPagina]).toEqual([3, 3, 100, 20]);
    expect(tabelaDetalhe(rows, 99).pagina).toBe(3);
    expect(tabelaDetalhe(rows, 0).pagina).toBe(1);
    const vazio = tabelaDetalhe([], 1);
    expect([vazio.pagina, vazio.totalPaginas, vazio.inicio, vazio.naPagina]).toEqual([1, 1, 0, 0]);
  });
  it('colaboradores marcados continuam na lista mesmo sem produção no período', () => {
    const ls = [linha({ colab: 'A', vig: '2026-02-01' }), linha({ colab: 'B', vig: '2025-02-01' })];
    expect(opcoesRetencao(ls, { s: '2026-01-01', e: '2026-12-31' }, []).col).toEqual(['A']);
    expect(opcoesRetencao(ls, { s: '2026-01-01', e: '2026-12-31' }, ['B']).col).toEqual(['A', 'B']);
  });
});
