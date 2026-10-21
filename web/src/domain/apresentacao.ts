// Modo apresentação / kickoff semanal (main.js 3964–4390): descritores dos slides e dados dos gráficos, sem DOM.
// Reaproveita as funções da aba Metas; o `withKfPeriod` do antigo (trocar f-vig-s/f-vig-e e restaurar) vira passar
// os filtros com a vigência trocada.
import type { DataISO, Linha } from './tipos';
import type { FiltrosGlobais } from './filtros';
import { buildMetasEquipeCards } from './metas';
import { buildMetasSemanal, computeMetaWeeks, type DadosSemanal, type EquipeMeta } from './metas-semanal';

export const KICKOFF_TEAMS: EquipeMeta[] = ['pessoais', 'patrimoniais', 'geral'];
export const KF_GOLD = '#D9A520', KF_GREEN = '#1A7A4C';
export const KF_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export type ModoKickoff = 'fechamento' | 'semana';
export type ValorMetaReal = { meta: number; real: number };
export type SlideEquipe = {
  type: 'team'; team: EquipeMeta; sub: string; period: string; caption: string;
  premio: ValorMetaReal; comissao: ValorMetaReal;
  ref: { p25: number; c25: number; pct: number; ano: number } | null;
};
export type SlideSemanas = {
  type: 'weekschart'; team: EquipeMeta; mes: string;
  weeks: { label: string; periodo: string; pMeta: number; pReal: number; cMeta: number; cReal: number }[];
};
export type Slide =
  | { type: 'cover'; mes: string }
  | { type: 'divider'; l1: string; l2: string; l3: string }
  | { type: 'closing'; text: string }
  | SlideEquipe
  | SlideSemanas;

const pad = (n: number) => String(n).padStart(2, '0');

/** Período do mês anterior ao informado (vs = 'YYYY-MM-01' do filtro). */
export function kfPrevMonthPeriod(vs: DataISO): { vs: DataISO; ve: DataISO; mesNome: string; ano: string } {
  const [y, m] = vs.split('-').map(Number); // m: 1-indexado
  const d0 = new Date(Date.UTC(y, m - 2, 1)); // 1º dia do mês anterior
  const py = d0.getUTCFullYear(), pm = d0.getUTCMonth(); // pm: 0-indexado
  const last = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
  return { vs: `${py}-${pad(pm + 1)}-01`, ve: `${py}-${pad(pm + 1)}-${pad(last)}`, mesNome: KF_MESES[pm], ano: String(py) };
}

/** withKfPeriod: os mesmos filtros com a vigência trocada. */
const comPeriodo = (f: FiltrosGlobais, vs: DataISO, ve: DataISO): FiltrosGlobais => ({ ...f, vigIni: vs, vigFim: ve });

/** Descritor de slide de equipe para uma semana específica. */
function kfWeekTeamSlide(week: Extract<DadosSemanal, { hasPeriod: true }>['weeks'][number], team: EquipeMeta, sub: string): SlideEquipe {
  const b = week.byTeam[team];
  return {
    type: 'team', team, sub, period: week.label, caption: week.periodoLabel,
    premio: { meta: b.metaPremio, real: b.realPremio },
    comissao: { meta: b.metaCom, real: b.realCom }, ref: null,
  };
}

type ComPeriodo = Extract<DadosSemanal, { hasPeriod: true }>;
type Cards = ReturnType<typeof buildMetasEquipeCards>;

/** Descritor de slide de equipe para o acumulado de um mês (com base do ano anterior). */
function kfMonthTeamSlide(semData: ComPeriodo, cardsData: Cards, team: EquipeMeta, opts: { sub: string; period: string; caption: string; refAno: number }): SlideEquipe {
  const tt = semData.totals[team], c = cardsData[team];
  return {
    type: 'team', team, sub: opts.sub, period: opts.period, caption: opts.caption,
    premio: { meta: tt.metaPremio, real: tt.realPremio },
    comissao: { meta: tt.metaCom, real: tt.realCom },
    ref: { p25: c.baseProd, c25: c.baseCom, pct: c.baseProd ? c.baseCom / c.baseProd : 0, ano: opts.refAno },
  };
}

/** Descritor do gráfico de evolução semanal de uma equipe (prêmio + comissão). */
function kfWeeksChartSlide(semData: ComPeriodo, team: EquipeMeta, mesNome: string): SlideSemanas {
  return {
    type: 'weekschart', team, mes: mesNome,
    weeks: semData.weeks.map(w => ({
      label: w.label, periodo: w.periodoLabel,
      pMeta: w.byTeam[team].metaPremio, pReal: w.byTeam[team].realPremio,
      cMeta: w.byTeam[team].metaCom, cReal: w.byTeam[team].realCom,
    })),
  };
}

/** mode: 'semana' (weekIdx 1-based; sem número, a semana que contém "hoje") | 'fechamento'. Sem vigência inicial ou sem semanas: []. */
export function buildKickoffSlides(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO, mn: number, mr: number, mode: ModoKickoff, weekIdx?: number): Slide[] {
  const vs = f.vigIni;
  if (!vs) return [];
  const mesNome = KF_MESES[(+vs.split('-')[1]) - 1];
  const ano = vs.split('-')[0];
  const refAno = (+ano - 1) % 100;
  const slides: Slide[] = [];

  if (mode === 'fechamento') {
    const pp = kfPrevMonthPeriod(vs);
    const curSem = buildMetasSemanal(linhas, f, hoje, mn, mr), curCards = buildMetasEquipeCards(linhas, f, hoje, mn, mr);
    const fPrev = comPeriodo(f, pp.vs, pp.ve);
    const prevSem = buildMetasSemanal(linhas, fPrev, hoje, mn, mr), prevCards = buildMetasEquipeCards(linhas, fPrev, hoje, mn, mr);
    if (!prevSem.hasPeriod || !prevSem.weeks.length) return [];
    // O antigo monta o mês atual sem checar hasPeriod: sem a vigência final ele quebraria; aqui sai vazio.
    if (!curSem.hasPeriod) return [];

    slides.push({ type: 'cover', mes: `${mesNome} ${ano}` });

    // Fechamento do mês anterior — acumulado por equipe
    slides.push({ type: 'divider', l1: 'Fechamento', l2: 'de', l3: pp.mesNome });
    KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(prevSem, prevCards, t, {
      sub: 'Fechamento do mês', period: pp.mesNome, caption: `${pp.mesNome} de ${pp.ano}`,
      refAno: (+pp.ano - 1) % 100,
    })));

    // Evolução semana a semana do mês anterior — um gráfico por equipe
    slides.push({ type: 'divider', l1: 'Evolução', l2: 'por', l3: 'Semana' });
    KICKOFF_TEAMS.forEach(t => slides.push(kfWeeksChartSlide(prevSem, t, pp.mesNome)));

    // Meta do mês atual — estrutura padrão
    slides.push({ type: 'divider', l1: 'Metas', l2: 'de', l3: mesNome });
    KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(curSem, curCards, t, {
      sub: 'Meta do mês', period: mesNome, caption: `${mesNome} de ${ano}`, refAno,
    })));

    slides.push({ type: 'closing', text: 'BORA TIME!' });
    return slides;
  }

  // mode === 'semana'
  const sem = buildMetasSemanal(linhas, f, hoje, mn, mr);
  if (!sem.hasPeriod || !sem.weeks.length) return [];
  const cards = buildMetasEquipeCards(linhas, f, hoje, mn, mr);
  let idx = (weekIdx != null) ? weekIdx - 1 : -1;
  if (idx < 0) {
    idx = sem.weeks.findIndex(w => hoje >= w.startStr && hoje <= w.endStr);
    if (idx < 0) idx = sem.weeks.length - 1;
  }
  idx = Math.max(0, Math.min(sem.weeks.length - 1, idx));
  const rw = sem.weeks[idx];

  slides.push({ type: 'cover', mes: `${mesNome} ${ano}` });

  slides.push({ type: 'divider', l1: 'Resultados', l2: 'da', l3: rw.label });
  KICKOFF_TEAMS.forEach(t => slides.push(kfWeekTeamSlide(rw, t, 'Produção da semana')));

  slides.push({ type: 'divider', l1: 'Resultados', l2: 'do', l3: 'Mês' });
  KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(sem, cards, t, {
    sub: 'Acumulado do mês', period: mesNome, caption: `${mesNome} de ${ano}`, refAno,
  })));

  slides.push({ type: 'closing', text: 'BORA TIME!' });
  return slides;
}

export type DadosChooser =
  | { semPeriodo: true }
  | { semPeriodo: false; mesNome: string; ano: string; prev: { mesNome: string }; semanas: { idx: number; label: string; periodoLabel: string }[] };

/** Tela inicial (kfShowChooser): precisa das duas pontas da vigência; senão, só a mensagem. */
export function dadosChooser(f: FiltrosGlobais): DadosChooser {
  const vs = f.vigIni, ve = f.vigFim;
  if (!vs || !ve) return { semPeriodo: true };
  const semanas = computeMetaWeeks(vs, ve).map(w => ({ idx: w.idx, label: w.label, periodoLabel: w.periodoLabel }));
  return { semPeriodo: false, mesNome: KF_MESES[(+vs.split('-')[1]) - 1], ano: vs.split('-')[0], prev: kfPrevMonthPeriod(vs), semanas };
}

/** Série do gráfico de barras horizontais Meta × Realizado (ch-kickoff): Prêmio e Comissão. */
export function dadosGraficoEquipe(s: SlideEquipe): { labels: string[]; meta: number[]; real: number[] } {
  return { labels: ['Prêmio', 'Comissão'], meta: [s.premio.meta, s.comissao.meta], real: [s.premio.real, s.comissao.real] };
}

/** Séries dos dois gráficos de evolução semanal (ch-kfw-p e ch-kfw-c): "Semana 1" vira "S1". */
export function dadosGraficosSemanas(s: SlideSemanas): { labels: string[]; pMeta: number[]; pReal: number[]; cMeta: number[]; cReal: number[] } {
  return {
    labels: s.weeks.map(w => w.label.replace('Semana ', 'S')),
    pMeta: s.weeks.map(w => w.pMeta), pReal: s.weeks.map(w => w.pReal),
    cMeta: s.weeks.map(w => w.cMeta), cReal: s.weeks.map(w => w.cReal),
  };
}

/** Nome do PDF: o mês/ano da capa em minúsculas e com hífen. */
export function nomeArquivoKickoff(slides: Slide[]): string {
  const cover = slides.find((s): s is Extract<Slide, { type: 'cover' }> => s.type === 'cover');
  const nome = (cover && cover.mes ? cover.mes : 'apresentacao').toString().toLowerCase().replace(/\s+/g, '-');
  return `kickoff-${nome}.pdf`;
}

/** kickoffNav: avança/volta sem passar das pontas. */
export const navegarSlide = (idx: number, d: number, total: number): number => Math.max(0, Math.min(total - 1, idx + d));
