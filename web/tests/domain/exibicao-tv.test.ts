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
import { rotaDeVolta } from '../../src/client/exibicaoTv';
import { vi, afterEach } from 'vitest';

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

// Fórmula do main.js (renderTvExMetaNovos): pct = meta ? real/meta : 0; gap = real − meta; largura = clamp(pct,0,1)·100 com 1 casa;
// classe: pct ≥ 1 → msem-ok, ≥ 0,8 → msem-warn, senão msem-bad; sinal "+" quando gap ≥ 0; meta = base do ano anterior × 1,40.
describe('meta mensal de novos: cartões (linhas sintéticas, Out/2026 × Out/2025)', () => {
  const rows = [
    linha({ tipo: 'N', vig: '2025-10-10', premio: 1000, com: 100, ramo: 'Vida Individual', apolice: 'b1' }), // base pessoais → meta 1400 / 140
    linha({ tipo: 'N', vig: '2026-10-05', premio: 500, com: 210, ramo: 'Vida Individual', apolice: 'r1' }), // real pessoais
    linha({ tipo: 'N', vig: '2026-10-06', premio: 700, com: 50, ramo: 'Empresarial', apolice: 'r2' }), // real patrimoniais, sem base (meta 0)
  ];
  const n = exibicaoTv(rows, HOJE).novos;
  const c = (metrica: 'premio' | 'comissao', t: string) => n.linhas.find(l => l.metrica === metrica)!.cartoes.find(x => x.team === t)!;
  it('bad (< 0,8): pessoais prêmio 500 / 1400 → 35,71%, gap −900, largura 35.7', () => {
    const x = c('premio', 'pessoais');
    expect(x.pctCls).toBe('msem-bad'); expect(x.pctTxt).toBe('35.71%'); expect(x.gap).toBeCloseTo(-900); expect(x.larguraPct).toBe('35.7');
  });
  it('warn (≥ 0,8): geral prêmio 1200 / 1400 → 85,71%, gap −200', () => {
    const x = c('premio', 'geral');
    expect(x.pctCls).toBe('msem-warn'); expect(x.pctTxt).toBe('85.71%'); expect(x.gap).toBeCloseTo(-200); expect(x.larguraPct).toBe('85.7');
  });
  it('ok (≥ 1) com pct > 1: pessoais comissão 210 / 140 → 150%, largura limitada a 100.0, gap +70', () => {
    const x = c('comissao', 'pessoais');
    expect(x.pctCls).toBe('msem-ok'); expect(x.pctTxt).toBe('150.00%'); expect(x.larguraPct).toBe('100.0'); expect(x.gap).toBeCloseTo(70); expect(x.gap >= 0).toBe(true);
    expect(c('comissao', 'geral').pctCls).toBe('msem-ok'); // 260 / 140
  });
  it('meta = 0 com realizado > 0 (patrimoniais): pct 0, classe bad, largura 0.0, gap positivo (+700)', () => {
    const x = c('premio', 'patrimoniais');
    expect(x.meta).toBe(0); expect(x.real).toBe(700);
    expect(x.pct).toBe(0); expect(x.pctTxt).toBe('0.00%'); expect(x.pctCls).toBe('msem-bad'); expect(x.larguraPct).toBe('0.0'); expect(x.gap).toBe(700);
  });
  it('limite: pct exatamente 1 é ok', () => {
    const r = [linha({ tipo: 'N', vig: '2025-10-10', premio: 1000, com: 1, ramo: 'Vida Individual', apolice: 'a' }), linha({ tipo: 'N', vig: '2026-10-05', premio: 1400, com: 1, ramo: 'Vida Individual', apolice: 'b' })];
    const x = exibicaoTv(r, HOJE).novos.linhas[0].cartoes.find(k => k.team === 'pessoais')!;
    expect(x.pctCls).toBe('msem-ok'); expect(x.gap).toBeCloseTo(0);
  });
});

describe('rotaDeVolta (fechar a Exibição TV)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ambiente = (guardada: string | null, search = '?f=x') => {
    const mem = new Map<string, string>(); if (guardada) mem.set('tvVoltarPara', guardada);
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    vi.stubGlobal('window', { location: { search, pathname: '/exibicao-tv' } });
    return mem;
  };
  it('volta para a aba guardada com ?f= e limpa a chave depois de ler', () => {
    const mem = ambiente('/metas');
    expect(rotaDeVolta()).toBe('/metas?f=x');
    expect(mem.has('tvVoltarPara')).toBe(false);
    expect(rotaDeVolta()).toBe('/visao-geral?f=x'); // segunda leitura: sem aba de origem
  });
  it('rota inválida (a própria exibição) cai em /visao-geral', () => {
    ambiente('/exibicao-tv');
    expect(rotaDeVolta()).toBe('/visao-geral?f=x');
  });
});
