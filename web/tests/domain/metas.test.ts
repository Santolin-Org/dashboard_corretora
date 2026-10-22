import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import { FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import {
  ORDEM_METAS_INICIAL, alternarOrdemMetas, buildMetasEquipeCards, buildMetasGroupData, filtrarMetas, getMetaPcts,
  getMetasBasePeriod, nomeCurtoColab, ordenarMetasColab, rotuloBaseMetas, totaisMetasColab, type ChaveMetas, type OrdemMetas,
} from '../../src/domain/metas';
import {
  EQUIPE_SEMANAL_INICIAL, METAS_SEM_TEAM_LBL, METRICA_SEMANAL_INICIAL, META_TEAMS, buildMetasSemanal, computeMetaWeeks, graficoSemanal, pctClsMeta,
  type EquipeMeta, type MetricaSemana,
} from '../../src/domain/metas-semanal';
import { fBRL, fP } from '../../src/domain/formatos';
import { carregarFixture } from './fixture';

const HOJE = '2026-10-15';
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

type Golden = { textos: Record<string, string>; graficos: Record<string, { labels: string[]; datasets: { label?: string; data: number[] }[] }> };
const dourado = (c: string): Golden => JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${c}.json`), 'utf8'));
// Espaços entre blocos são da casca (JSX); aqui só importam os caracteres.
const sem = (s: string) => s.replace(/\s+/g, '');

type Caso = {
  f?: Partial<FiltrosGlobais>; novos?: string; renov?: string; equipe?: EquipeMeta; metrica?: MetricaSemana; ordem?: OrdemMetas; detalhe?: boolean;
};
const SET = { vigIni: '2026-09-01', vigFim: '2026-09-30' };
const CASOS: Record<string, Caso> = {
  'metas-padrao': {},
  'metas-vigencia': { f: { vigIni: '2026-01-01', vigFim: '2026-09-30' } },
  'metas-colab': { f: { col: ['ANA CLARA MENDES'] } },
  'metas-tipos': { f: { tipos: ['N', 'EN'] } },
  'metas-ramo-seg': { f: { ram: ['Automóvel - Casco'], seg: ['Porto Seguro'] } },
  'metas-equipe-pessoais': { f: SET, equipe: 'pessoais' },
  'metas-equipe-patrimoniais': { f: SET, equipe: 'patrimoniais' },
  'metas-metrica-comissao': { f: SET, metrica: 'comissao' },
  'metas-comissao-patrimoniais': { f: SET, equipe: 'patrimoniais', metrica: 'comissao' },
  'metas-ordenacao': { ordem: { chave: 'pctComAnt', dir: 'asc' } },
  'metas-ordenacao-nome': { ordem: { chave: 'nome', dir: 'desc' } },
  'metas-detalhe': { detalhe: true, ordem: { chave: 'nome', dir: 'desc' } },
  'metas-pct': { f: SET, novos: '25', renov: '' },
  'metas-mes-curto': { f: { vigIni: '2026-10-01', vigFim: '2026-10-31' } },
};

const textoCards = (c: ReturnType<typeof buildMetasEquipeCards>) => {
  const card = (nome: string, x: typeof c.pessoais) =>
    `${nome}${x.ramos.length ? `${x.ramos.length} ramo${x.ramos.length > 1 ? 's' : ''}` : ''}Meta Prêmio${fBRL(x.metaProd)}Meta Comissão${fBRL(x.metaCom)}Base Prêmio${fBRL(x.baseProd)}Base Comissão${fBRL(x.baseCom)}% Comissão${fP(x.pctMetaCom)}`;
  return card('Pessoais', c.pessoais) + card('Patrimoniais', c.patrimoniais) + card('Geral', c.geral);
};
const textoColab = (rows: ReturnType<typeof buildMetasGroupData>, detalhe: boolean) => {
  const t = totaisMetasColab(rows);
  const p = (a: number, b: number) => fP(b ? a / b : 0);
  if (!detalhe) {
    return rows.map(r => `${nomeCurtoColab(r.nome)}${fBRL(r.totalAnt)}${fBRL(r.totalComAnt)}${fP(r.pctComAnt)}${fBRL(r.metaTotalProd)}${fBRL(r.metaTotalCom)}${fP(r.pctMetaCom)}`).join('')
      + `Total geral${fBRL(t.totalAnt)}${fBRL(t.totalComAnt)}${p(t.totalComAnt, t.totalAnt)}${fBRL(t.metaTotalProd)}${fBRL(t.metaTotalCom)}${p(t.metaTotalCom, t.metaTotalProd)}`;
  }
  return rows.map(r => `${nomeCurtoColab(r.nome)}${fBRL(r.np)}${fBRL(r.nc)}${p(r.nc, r.np)}${fBRL(r.metaNProd)}${fBRL(r.metaNCom)}${fBRL(r.rp)}${fBRL(r.rc)}${p(r.rc, r.rp)}${fBRL(r.metaRProd)}${fBRL(r.metaRCom)}${fBRL(r.totalAnt)}${fBRL(r.totalComAnt)}${fP(r.pctComAnt)}${fBRL(r.metaTotalProd)}${fBRL(r.metaTotalCom)}`).join('')
    + `Total geral${fBRL(t.np)}${fBRL(t.nc)}${p(t.nc, t.np)}${fBRL(t.metaNProd)}${fBRL(t.metaNCom)}${fBRL(t.rp)}${fBRL(t.rc)}${p(t.rc, t.rp)}${fBRL(t.metaRProd)}${fBRL(t.metaRCom)}${fBRL(t.totalAnt)}${fBRL(t.totalComAnt)}${p(t.totalComAnt, t.totalAnt)}${fBRL(t.metaTotalProd)}${fBRL(t.metaTotalCom)}`;
};

describe('Metas contra os dourados da fixture', () => {
  it.each(Object.keys(CASOS))('%s: base, cards, semanal, gráfico e tabela por colaborador', (nome) => {
    const c = CASOS[nome], g = dourado(nome);
    const f: FiltrosGlobais = { ...FILTROS_VAZIOS, ...(c.f ?? {}) };
    const { mn, mr } = getMetaPcts(c.novos ?? '10', c.renov ?? '10');
    const equipe = c.equipe ?? EQUIPE_SEMANAL_INICIAL, metrica = c.metrica ?? METRICA_SEMANAL_INICIAL;

    expect(rotuloBaseMetas(getMetasBasePeriod(f, HOJE))).toBe(g.textos['metas-base-label']);

    const cards = buildMetasEquipeCards(ALL, f, HOJE, mn, mr);
    expect(sem(textoCards(cards))).toBe(sem(g.textos['metas-equipe-cards']));
    expect(sem(cards.excluded.length ? `Fora da contagem da meta(${cards.excluded.length}):${cards.excluded.join('·')}` : 'Nenhum ramo fora da meta no período base.'))
      .toBe(sem(g.textos['metas-excluidos-note']));

    const d = buildMetasSemanal(ALL, f, HOJE, mn, mr);
    if (!d.hasPeriod) {
      expect(g.textos['metas-sem-mtd']).toBe('Selecione um período de vigência (ex.: o mês atual) para ver o acompanhamento semanal.');
      expect(g.graficos['ch-metas-semanal']).toBeUndefined();
    } else {
      expect(g.textos['metas-semanal-badge']).toBe(`${d.weeks.length} semanas · ${metrica === 'comissao' ? 'Comissão' : 'Prêmio'}`);
      const linha = (m: MetricaSemana) => META_TEAMS.map(t => {
        const tt = d.totals[t], real = m === 'comissao' ? tt.realCom : tt.realPremio, meta = m === 'comissao' ? tt.metaCom : tt.metaPremio, gap = real - meta;
        return `${METAS_SEM_TEAM_LBL[t]}${fP(meta ? real / meta : 0)}${fBRL(real)}/${fBRL(meta)}${gap >= 0 ? '+' : ''}${fBRL(gap)}`;
      }).join('');
      expect(sem(`Prêmio${linha('premio')}Comissão${linha('comissao')}`)).toBe(sem(g.textos['metas-sem-mtd']));

      const gr = graficoSemanal(d.weeks, equipe, metrica);
      const gg = g.graficos['ch-metas-semanal'];
      expect(gr.labels).toEqual(gg.labels);
      expect(gr.real).toEqual(gg.datasets[0].data);
      expect(gr.meta).toEqual(gg.datasets[1].data);

      const rk = metrica === 'comissao' ? 'realCom' : 'realPremio', mk = metrica === 'comissao' ? 'metaCom' : 'metaPremio';
      let acR = 0, acM = 0;
      const linhas = d.weeks.map(w => {
        const r = w.byTeam[equipe][rk], m = w.byTeam[equipe][mk]; acR += r; acM += m;
        return `${w.label}${w.periodoLabel}${w.days}${fBRL(r)}${fBRL(m)}${fP(m ? r / m : 0)}${fBRL(acR)}${fBRL(acM)}${fP(acM ? acR / acM : 0)}`;
      }).join('');
      const tt = d.totals[equipe], tr = tt[rk], tm = tt[mk];
      const dias = d.weeks.reduce((s, w) => s + w.days, 0);
      const cab = 'SemanaPeríodoDiasRealizadoMeta% metaAcum. real.Acum. meta% acum.';
      expect(sem(cab + linhas + `Total ${METAS_SEM_TEAM_LBL[equipe]}${dias}${fBRL(tr)}${fBRL(tm)}${fP(tm ? tr / tm : 0)}${fBRL(tr)}${fBRL(tm)}${fP(tm ? tr / tm : 0)}`))
        .toBe(sem(g.textos['metas-sem-table-wrap']));
      for (const x of [0.5, 0.85, 1]) expect(pctClsMeta(x)).toMatch(/^msem-(bad|warn|ok)$/);
    }

    const rows = ordenarMetasColab(buildMetasGroupData(filtrarMetas(ALL, f, HOJE), mn, mr), c.ordem ?? ORDEM_METAS_INICIAL);
    expect(g.textos['metas-colab-badge']).toBe(`${rows.length} colaboradores`);
    const wrap = sem(g.textos['metas-colab-wrap']);
    expect(wrap.endsWith(sem(textoColab(rows, !!c.detalhe)))).toBe(true);
  });

  it('computeMetaWeeks: fragmento inicial de até 3 dias entra na semana seguinte; de 4+ dias fica sozinho', () => {
    const out = computeMetaWeeks('2026-10-01', '2026-10-31'); // quinta: 1–3/out (3 dias) funde com 4–10
    expect(out.map(w => [w.periodoLabel, w.days])).toEqual([['01/10–10/10', 10], ['11/10–17/10', 7], ['18/10–24/10', 7], ['25/10–31/10', 7]]);
    const set = computeMetaWeeks('2026-09-01', '2026-09-30'); // terça: 1–5/set (5 dias) fica
    expect(set[0]).toMatchObject({ label: 'Semana 1', days: 5, periodoLabel: '01/09–05/09' });
    expect(set.at(-1)).toMatchObject({ days: 4, periodoLabel: '27/09–30/09' });
  });

  it('ordenação: coluna nova começa em desc; a mesma inverte', () => {
    const o1 = alternarOrdemMetas(ORDEM_METAS_INICIAL, 'totalAnt' as ChaveMetas);
    expect(o1).toEqual({ chave: 'totalAnt', dir: 'asc' });
    expect(alternarOrdemMetas(o1, 'nome')).toEqual({ chave: 'nome', dir: 'desc' });
  });

  it('base do ano anterior: sem vigência é o ano civil anterior a "hoje"; 29/fev rola para 01/mar só no rótulo', () => {
    expect(getMetasBasePeriod(FILTROS_VAZIOS, HOJE)).toEqual({ startStr: '2025-01-01', endStr: '2025-12-31' });
    const p = getMetasBasePeriod({ vigIni: '2024-02-01', vigFim: '2024-02-29' }, HOJE);
    expect(p).toEqual({ startStr: '2023-02-01', endStr: '2023-02-29' });
    expect(rotuloBaseMetas(p)).toBe('Base: 01/fev/2023 – 01/mar/2023');
  });
});
