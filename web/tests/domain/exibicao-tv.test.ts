import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import { fBRL, fN, fP } from '../../src/domain/formatos';
import {
  TV_NOVOS_GROWTH, buildTvAnoCarteira, buildTvMetaNovos, buildTvNivelCounts, exibicaoTv, fVarPct, tvCarteiraAtivaHoje, tvColabExcluido,
  tvDuracaoOk, tvRamoCarteiraOk, type DadosTv,
} from '../../src/domain/exibicao-tv';
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

const textoMeta = (m: DadosTv['metasSantolin']['qtd']) =>
  colapsar(`${m.label} ${m.valor} / ${m.metaFinal} ${m.marcadores.map(k => `Fase ${k.fase}${k.valor}`).join('')} ${m.badge}`);
const textoNovos = (d: DadosTv['novos']) =>
  colapsar(d.linhas.map(l => `${l.rotulo} ` + l.cartoes.map(c => `${c.label} ${c.pctTxt} ${fBRL(c.real)} / ${fBRL(c.meta)} ${c.gap >= 0 ? '+' : ''}${fBRL(c.gap)}`).join(' ')).join(' '));
const textoPodio = (p: DadosTv['podio']) =>
  p.vazio ? 'Nenhuma apólice da campanha Santolin 360 ainda.'
    : colapsar(p.colunas.map(c => `${c.titulo} ${c.nomes[1]} 2 ${c.nomes[0]} 1 ${c.nomes[2]} 3`).join(' '));

describe.each(['exibicao-tv-padrao', 'exibicao-tv-modo-tv'])('%s (esperado do dourado da fixture)', (cenario) => {
  const g = dourado(cenario);
  it('badges e textos dos blocos', () => {
    const d = exibicaoTv(ALL, HOJE);
    expect(d.novos.badge).toBe(g.textos['tv-ex-novos-badge']);
    expect(textoNovos(d.novos)).toBe(g.textos['tv-ex-novos-body']);
    expect(textoMeta(d.metasSantolin.com)).toBe(g.textos['tv-ex-santolin-com']);
    expect(textoMeta(d.metasSantolin.qtd)).toBe(g.textos['tv-ex-santolin-qtd']);
    expect(d.podio.badge).toBe(g.textos['tv-ex-santolin-badge']);
    expect(textoPodio(d.podio)).toBe(g.textos['tv-ex-santolin-podium']);
    expect(d.ano.badge).toBe(g.textos['tv-ex-ano-badge']);
    expect(d.nivel.badge).toBe(g.textos['tv-ex-nivel-badge']);
  });
  it('gráfico carteira acumulada por ano', () => {
    const { labels, data } = buildTvAnoCarteira(ALL, HOJE);
    const gr = g.graficos['tv-ex-ano-chart'];
    expect(labels).toEqual(gr.labels);
    expect(data).toEqual(gr.datasets[0].data);
    expect(data).toEqual(gr.datasets[1].data);
  });
  it('gráfico clientes por nível', () => {
    const gr = g.graficos['tv-ex-nivel-chart'];
    expect(buildTvNivelCounts(ALL, HOJE)).toEqual(gr.datasets[0].data);
    expect(exibicaoTv(ALL, HOJE).nivel.labels).toEqual(gr.labels);
  });
});

describe('regras (linhas sintéticas)', () => {
  it('colaboradores excluídos por prefixo normalizado', () => {
    expect(tvColabExcluido('Celso Silva')).toBe(true);
    expect(tvColabExcluido('Transferência DE Corretagem')).toBe(true);
    expect(tvColabExcluido('denise')).toBe(true);
    expect(tvColabExcluido('Ana Celso')).toBe(false);
    expect(tvColabExcluido('')).toBe(false);
  });
  it('duração mínima de 350 dias; sem término passa; ramos fora', () => {
    expect(tvDuracaoOk(linha({ vig: '2025-01-01', fim: '2025-12-16' }))).toBe(false); // 349 dias
    expect(tvDuracaoOk(linha({ vig: '2025-01-01', fim: '2025-12-17' }))).toBe(true); // 350 dias
    expect(tvDuracaoOk(linha({ fim: '' }))).toBe(true);
    expect(tvRamoCarteiraOk(linha({ ramo: 'Viagem Internacional' }))).toBe(false);
    expect(tvRamoCarteiraOk(linha({ ramo: 'Carta Verde' }))).toBe(false);
    expect(tvRamoCarteiraOk(linha({ ramo: 'Automóvel' }))).toBe(true);
  });
  it('carteira ativa: dedup por seguradora+apólice (início mais recente), vencida além da folga e endosso fora', () => {
    const a = linha({ apolice: 'X', vig: '2025-10-01', fim: '2026-10-01' });
    const b = linha({ apolice: 'X', vig: '2026-01-01', fim: '2027-01-01' });
    const vencida = linha({ apolice: 'V', fim: '2026-09-29' }); // 16 dias antes de hoje
    const folga = linha({ apolice: 'F', fim: '2026-09-30' }); // 15 dias: ainda conta
    const endosso = linha({ apolice: 'E', endosso: '1' });
    const semNumero1 = linha({ apolice: '', fim: '2027-03-01' }), semNumero2 = linha({ apolice: '', fim: '2027-03-01' });
    const r = tvCarteiraAtivaHoje([a, b, vencida, folga, endosso, semNumero1, semNumero2], HOJE);
    expect(r).toContain(b); expect(r).not.toContain(a); expect(r).not.toContain(vencida); expect(r).toContain(folga);
    expect(r).not.toContain(endosso); expect(r).toContain(semNumero1); expect(r).toContain(semNumero2);
  });
  it('níveis: 1, 2, 3 e 4+ apólices ativas por documento', () => {
    const l = (doc: string, n: number) => Array.from({ length: n }, (_, i) => linha({ docDigits: doc, apolice: `${doc}-${i}`, fim: '2027-03-01' }));
    expect(buildTvNivelCounts([...l('1', 1), ...l('2', 2), ...l('3', 3), ...l('4', 4), ...l('5', 7), linha({ docDigits: '', fim: '2027-03-01' })], HOJE)).toEqual([1, 1, 1, 2]);
  });
  it('meta mensal: só tipo N, ramos fora da meta, mês corrente × mesmo mês do ano anterior ×1,40, sem colaboradores excluídos', () => {
    const rows = [
      linha({ tipo: 'N', vig: '2026-10-05', premio: 1000, com: 100, ramo: 'Vida Individual' }), // real pessoal
      linha({ tipo: 'N', vig: '2025-10-20', premio: 500, com: 50, ramo: 'Vida Individual' }), // base pessoal
      linha({ tipo: 'N', vig: '2025-10-21', premio: 200, com: 20, ramo: 'Empresarial' }), // base patrimonial
      linha({ tipo: 'R', vig: '2025-10-21', premio: 999, com: 99 }), // não é N
      linha({ tipo: 'N', vig: '2025-10-22', premio: 999, com: 99, colab: 'Celso' }), // excluído
      linha({ tipo: 'N', vig: '2025-09-30', premio: 999, com: 99 }), // fora do mês
    ];
    const { curStart, data } = buildTvMetaNovos(rows, HOJE);
    expect(curStart).toBe('2026-10-01');
    expect(TV_NOVOS_GROWTH).toBe(1.4);
    expect(data.pessoais.realPremio).toBe(1000);
    expect(data.pessoais.metaPremio).toBeCloseTo(700);
    expect(data.patrimoniais.metaCom).toBeCloseTo(28);
    expect(data.geral.metaPremio).toBeCloseTo(980);
    expect(data.geral.baseCom).toBe(70);
  });
  it('carteira por ano: anos fechados por data (vig/fim/cancel), ano corrente = ativa hoje', () => {
    const rows = [
      linha({ apolice: 'A', sit: 'Renovada', vig: '2022-03-01', fim: '2023-03-01' }), // 2022 conta; 2023 não (31/12/2023 > fim)
      linha({ apolice: 'B', sit: 'Cancelada', vig: '2022-03-01', fim: '2023-03-01', cancel: '2022-08-01' }), // cancelada antes do fim de 2022
      linha({ apolice: 'C', sit: 'Ativa', vig: '2025-03-01', fim: '2026-12-01' }),
    ];
    const { labels, data } = buildTvAnoCarteira(rows, HOJE);
    expect(labels).toEqual(['2022', '2023', '2024', '2025', '2026']);
    expect(data).toEqual([1, 0, 0, 1, 1]);
    expect(buildTvAnoCarteira([], HOJE)).toEqual({ labels: [], data: [] });
  });
  it('variação percentual com sinal e uma casa', () => {
    expect(fVarPct(0.1234)).toBe('+12,3%');
    expect(fVarPct(-0.05)).toBe('−5,0%');
    expect(fVarPct(0)).toBe('+0,0%');
  });
  it('pódio: nome curto e exclusão de Celso/Denise; vazio sem apólices da campanha', () => {
    const c = (colab: string, vig = '2026-08-10') => linha({ campanha: 'SANTOLIN 360', colab, vig, com: 5, apolice: colab + vig });
    const d = exibicaoTv([c('Fernando Dias Souza'), c('Fernando Dias Souza'), c('Celso X'), c('Maria')], HOJE);
    expect(d.podio.vazio).toBe(false);
    expect(d.podio.colunas[0].nomes[0]).toBe('Fernando D.');
    expect(d.podio.colunas[0].nomes[1]).toBe('Maria');
    expect(d.metasSantolin.qtd.valor).toBe(fN(3));
    expect(d.metasSantolin.com.valor).toBe(fBRL(15));
    expect(exibicaoTv([], HOJE).podio.vazio).toBe(true);
    void fP;
  });
});
