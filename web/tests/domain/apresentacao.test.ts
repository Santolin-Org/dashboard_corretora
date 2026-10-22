import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import { FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import { getMetaPcts } from '../../src/domain/metas';
import { METAS_SEM_TEAM_LBL } from '../../src/domain/metas-semanal';
import { fBRL, fP } from '../../src/domain/formatos';
import {
  KF_MESES, KICKOFF_TEAMS, buildKickoffSlides, dadosChooser, dadosGraficoEquipe, dadosGraficosSemanas, kfPrevMonthPeriod, nomeArquivoKickoff,
  navegarSlide, type Slide,
} from '../../src/domain/apresentacao';
import { carregarFixture } from './fixture';

const HOJE = '2026-10-15';
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

type Golden = { textos: Record<string, string>; graficos: Record<string, { labels: string[]; datasets: { label?: string; data: number[] }[] }> };
const dourado = (c: string): Golden => JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${c}.json`), 'utf8'));
const sem = (s: string) => s.replace(/\s+/g, '');
const OUT: FiltrosGlobais = { ...FILTROS_VAZIOS, vigIni: '2026-10-01', vigFim: '2026-10-31' };
const SET: FiltrosGlobais = { ...FILTROS_VAZIOS, vigIni: '2026-09-01', vigFim: '2026-09-30' };

// Texto de cada slide (o que o antigo coloca em #kf-stage), só os caracteres.
function textoSlide(s: Slide): string {
  if (s.type === 'cover') return `ReuniãodeKick-off${s.mes}`;
  if (s.type === 'divider') return `${s.l1}${s.l2}${s.l3}`;
  if (s.type === 'closing') return s.text;
  if (s.type === 'weekschart') return `Nossaevolução${METAS_SEM_TEAM_LBL[s.team]}Evoluçãosemanal${s.mes}Realizadovs.esperadoPrêmioComissão`;
  const ref = s.ref ? `Prêmio/${s.ref.ano}:${fBRL(s.ref.p25)}Comissão/${s.ref.ano}:${fBRL(s.ref.c25)}%Médio:${fP(s.ref.pct)}` : '';
  return `Nossosobjetivos${METAS_SEM_TEAM_LBL[s.team]}${s.sub}${s.period}${s.caption}${ref}`;
}

type Caso = { f: FiltrosGlobais; modo: 'fechamento' | 'semana'; semana?: number; idx: number; novos?: string; renov?: string };
const CASOS: Record<string, Caso> = {};
for (let i = 0; i < 14; i++) CASOS[`apresentacao-fechamento-${String(i + 1).padStart(2, '0')}`] = { f: OUT, modo: 'fechamento', idx: i };
for (let i = 0; i < 10; i++) CASOS[`apresentacao-semana3-${String(i + 1).padStart(2, '0')}`] = { f: OUT, modo: 'semana', semana: 3, idx: i };
Object.assign(CASOS, {
  'apresentacao-semana1-03': { f: OUT, modo: 'semana', semana: 1, idx: 2 },
  'apresentacao-semana4-06': { f: OUT, modo: 'semana', semana: 4, idx: 5 },
  'apresentacao-pct-fechamento-12': { f: OUT, modo: 'fechamento', idx: 11, novos: '25', renov: '' },
  'apresentacao-fechamento-fim': { f: OUT, modo: 'fechamento', idx: 99 }, // Próximo além do fim fica no último
  'apresentacao-fechamento-anterior': { f: OUT, modo: 'fechamento', idx: 3 },
  'apresentacao-fechamento-ponto': { f: OUT, modo: 'fechamento', idx: 7 },
  'apresentacao-setembro-semana1-03': { f: SET, modo: 'semana', semana: 1, idx: 2 },
} satisfies Record<string, Caso>);

describe('slides do modo apresentação == dourados do antigo', () => {
  for (const [nome, c] of Object.entries(CASOS)) {
    it(nome, () => {
      const g = dourado(nome);
      const { mn, mr } = getMetaPcts(c.novos ?? '10', c.renov ?? '10');
      const slides = buildKickoffSlides(ALL, c.f, HOJE, mn, mr, c.modo, c.semana);
      const s = slides[Math.min(c.idx, slides.length - 1)];
      expect(sem(g.textos['kf-stage'])).toBe(sem(textoSlide(s)));
      if (s.type === 'team') {
        const d = dadosGraficoEquipe(s);
        const ch = g.graficos['ch-kickoff'];
        expect(d.labels).toEqual(ch.labels);
        expect(ch.datasets.map(x => x.label)).toEqual(['Meta', 'Realizado']);
        expect(d.meta).toEqual(ch.datasets[0].data);
        expect(d.real).toEqual(ch.datasets[1].data);
      } else if (s.type === 'weekschart') {
        const d = dadosGraficosSemanas(s);
        for (const [id, meta, real] of [['ch-kfw-p', d.pMeta, d.pReal], ['ch-kfw-c', d.cMeta, d.cReal]] as const) {
          const ch = g.graficos[id];
          expect(d.labels).toEqual(ch.labels);
          expect(ch.datasets.map(x => x.label)).toEqual(['Esperado', 'Realizado']);
          expect(meta).toEqual(ch.datasets[0].data);
          expect(real).toEqual(ch.datasets[1].data);
        }
      } else {
        expect(Object.keys(g.graficos)).toEqual([]);
      }
    });
  }

  it('quantidade e ordem das equipes: pessoais, patrimoniais, geral', () => {
    expect(KICKOFF_TEAMS).toEqual(['pessoais', 'patrimoniais', 'geral']);
    expect(buildKickoffSlides(ALL, OUT, HOJE, 0.1, 0.1, 'fechamento')).toHaveLength(14);
    expect(buildKickoffSlides(ALL, OUT, HOJE, 0.1, 0.1, 'semana', 3)).toHaveLength(10);
  });

  it('semana sem número: a que contém "hoje"; fora do mês, a última; índice fora é limitado', () => {
    const rotulo = (hoje: string, semana?: number) => (buildKickoffSlides(ALL, OUT, hoje, 0.1, 0.1, 'semana', semana)[1] as { l3: string }).l3;
    expect(rotulo('2026-10-15')).toBe('Semana 2'); // 15/10 está em 11/10–17/10
    expect(rotulo('2026-11-20')).toBe('Semana 4'); // depois do período: a última
    expect(rotulo('2026-10-15', 99)).toBe('Semana 4');
    expect(rotulo('2026-10-15', 0)).toBe('Semana 2'); // weekIdx 0 → índice -1 (como sem número): procura "hoje"
  });

  it('sem a vigência inicial ou com um mês sem semanas: nenhum slide', () => {
    expect(buildKickoffSlides(ALL, FILTROS_VAZIOS, HOJE, 0.1, 0.1, 'fechamento')).toEqual([]);
    expect(buildKickoffSlides(ALL, FILTROS_VAZIOS, HOJE, 0.1, 0.1, 'semana', 1)).toEqual([]);
    expect(buildKickoffSlides(ALL, { ...FILTROS_VAZIOS, vigIni: '2026-10-01' }, HOJE, 0.1, 0.1, 'semana', 1)).toEqual([]); // sem vigFim não há semanas
  });
});

describe('tela de escolha', () => {
  it('== dourado: título do mês, mês anterior e botões de semana', () => {
    const d = dadosChooser(OUT);
    expect(d.semPeriodo).toBe(false);
    if (d.semPeriodo) return;
    const t = dourado('apresentacao-padrao').textos['kf-stage'];
    expect(sem(t)).toBe(sem(
      `Modoapresentação${d.mesNome}de${d.ano}Fechamentodemês` +
      `Consolidaosresultadosde${d.prev.mesNome},mostraaevoluçãosemanaasemanavs.oesperadoeapresentaametade${d.mesNome}.Gerar›Resultadopor` +
      `semanaEscolhaumasemanade${d.mesNome}:${d.semanas.map(w => `${w.label}${w.periodoLabel}`).join('')}`,
    ));
  });
  it('sem as duas pontas da vigência: só a mensagem', () => {
    expect(dadosChooser(FILTROS_VAZIOS)).toEqual({ semPeriodo: true });
    expect(dadosChooser({ ...FILTROS_VAZIOS, vigIni: '2026-10-01' })).toEqual({ semPeriodo: true });
    expect(dourado('apresentacao-sem-vigencia').textos['kf-stage']).toBe('Selecione um período de vigência na aba Metas para gerar a apresentação.');
  });
});

describe('funções auxiliares', () => {
  it('kfPrevMonthPeriod: mês anterior inteiro, virada de ano e fevereiro bissexto', () => {
    expect(kfPrevMonthPeriod('2026-10-01')).toEqual({ vs: '2026-09-01', ve: '2026-09-30', mesNome: 'Setembro', ano: '2026' });
    expect(kfPrevMonthPeriod('2026-01-15')).toEqual({ vs: '2025-12-01', ve: '2025-12-31', mesNome: 'Dezembro', ano: '2025' });
    expect(kfPrevMonthPeriod('2024-03-01')).toEqual({ vs: '2024-02-01', ve: '2024-02-29', mesNome: 'Fevereiro', ano: '2024' });
    expect(KF_MESES).toHaveLength(12);
  });
  it('nomeArquivoKickoff: mês e ano da capa, minúsculos e com hífen; sem capa, "apresentacao"', () => {
    expect(nomeArquivoKickoff([{ type: 'cover', mes: 'Março 2026' }])).toBe('kickoff-março-2026.pdf');
    expect(nomeArquivoKickoff([{ type: 'closing', text: 'x' }])).toBe('kickoff-apresentacao.pdf');
  });
  it('navegarSlide: limita entre 0 e o último', () => {
    expect(navegarSlide(0, -1, 14)).toBe(0);
    expect(navegarSlide(13, 1, 14)).toBe(13);
    expect(navegarSlide(5, 1, 14)).toBe(6);
  });
});
