// Acompanhamento semanal x meta (main.js 3745–3925 e 4058+): cálculos puros, sem DOM. O modo apresentação (Task 20)
// reaproveita computeMetaWeeks/buildMetasSemanal/META_TEAMS passando os filtros com a vigência trocada (withKfPeriod).
import type { DataISO, Linha } from './tipos';
import type { FiltrosGlobais } from './filtros';
import { classifyRamo } from './ramos';
import { buildMetasEquipeCards, getMetasRealizadoData } from './metas';

export type EquipeMeta = 'geral' | 'pessoais' | 'patrimoniais';
export type MetricaSemana = 'premio' | 'comissao';
export const META_TEAMS: EquipeMeta[] = ['geral', 'pessoais', 'patrimoniais'];
/** `metaWeekTeam` / `metaWeekMetric` do topo do main.js. */
export const EQUIPE_SEMANAL_INICIAL: EquipeMeta = 'geral';
export const METRICA_SEMANAL_INICIAL: MetricaSemana = 'premio';
export const METAS_SEM_TEAM_LBL: Record<EquipeMeta, string> = { geral: 'Geral', pessoais: 'Pessoais', patrimoniais: 'Patrimoniais' };
export const METAS_SEM_TEAM_COLOR: Record<EquipeMeta, string> = { geral: '#4E80FF', pessoais: '#22D3EE', patrimoniais: '#F5A623' };

export type SemanaMeta = {
  idx: number; label: string; startStr: DataISO; endStr: DataISO; days: number; periodoLabel: string;
  byTeam: Record<EquipeMeta, { realPremio: number; realCom: number; metaPremio: number; metaCom: number }>;
};
type SemanaBase = Omit<SemanaMeta, 'byTeam'>;
export type TotaisSemanal = Record<EquipeMeta, { realPremio: number; realCom: number; metaPremio: number; metaCom: number }>;
export type DadosSemanal = { hasPeriod: false } | { hasPeriod: true; weeks: SemanaMeta[]; totals: TotaisSemanal };

const MS_DIA = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const doUtc = (s: DataISO): number => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isoDe = (ms: number): DataISO => new Date(ms).toISOString().slice(0, 10);
const ddmm = (ms: number): string => { const d = new Date(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; };

/** Divide o período em semanas de calendário (domingo→sábado); a semana 1 começa no dia 1 e a última pode ser parcial. */
export function computeMetaWeeks(vs: DataISO, ve: DataISO): SemanaBase[] {
  const start = doUtc(vs), end = doUtc(ve);
  const buckets = new Map<DataISO, { first: number; last: number; days: number }>();
  for (let cur = start; cur <= end; cur += MS_DIA) {
    const ws = cur - new Date(cur).getUTCDay() * MS_DIA; // domingo da semana
    const key = isoDe(ws);
    if (!buckets.has(key)) buckets.set(key, { first: cur, last: cur, days: 0 });
    const b = buckets.get(key)!; b.last = cur; b.days++;
  }
  const arr = [...buckets.values()];
  // Começo do mês: se o fragmento inicial for muito curto (≤3 dias), ele é
  // incorporado à semana de calendário seguinte (ex.: mês que começa numa sexta
  // → semana 1 = sexta/sábado + semana seguinte). Fragmentos de 4+ dias ficam
  // como Semana 1 por conta própria. A última semana nunca é fundida — pode
  // terminar com poucos dias (a reunião é sempre na segunda).
  if (arr.length > 1 && arr[0].days <= 3) {
    arr[1].first = arr[0].first; arr[1].days += arr[0].days;
    arr.shift();
  }
  let i = 0;
  return arr.map(b => {
    i++;
    return { idx: i, label: 'Semana ' + i, startStr: isoDe(b.first), endStr: isoDe(b.last), days: b.days, periodoLabel: ddmm(b.first) + '–' + ddmm(b.last) };
  });
}

/**
 * buildMetasSemanal: sem as duas pontas da vigência não há acompanhamento. A meta de cada semana é a meta do período
 * proporcional aos dias; o realizado do gráfico/tabela cai na semana da EMISSÃO (fora das semanas, na borda mais
 * próxima), enquanto os cartões-resumo somam por vigência.
 */
export function buildMetasSemanal(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO, mn: number, mr: number): DadosSemanal {
  const vs = f.vigIni, ve = f.vigFim;
  if (!vs || !ve) return { hasPeriod: false };
  const base = computeMetaWeeks(vs, ve);
  const totalDays = base.reduce((s, w) => s + w.days, 0) || 1;
  const cards = buildMetasEquipeCards(linhas, f, hoje, mn, mr);
  const teamMeta = {
    geral: { premio: cards.geral.metaProd, com: cards.geral.metaCom },
    pessoais: { premio: cards.pessoais.metaProd, com: cards.pessoais.metaCom },
    patrimoniais: { premio: cards.patrimoniais.metaProd, com: cards.patrimoniais.metaCom },
  };
  const weeks: SemanaMeta[] = base.map(b => {
    const byTeam = {} as SemanaMeta['byTeam'];
    for (const t of META_TEAMS) {
      byTeam[t] = {
        realPremio: 0, realCom: 0,
        metaPremio: teamMeta[t].premio * (b.days / totalDays),
        metaCom: teamMeta[t].com * (b.days / totalDays),
      };
    }
    return { ...b, byTeam };
  });
  const realizado = getMetasRealizadoData(linhas, f); // já filtrado por vigência no período

  // Cards resumo (totais do período): por vigência — soma direta, independente
  // de qual semana o registro cai no gráfico abaixo.
  const totals = {} as TotaisSemanal;
  for (const t of META_TEAMS) totals[t] = { realPremio: 0, realCom: 0, metaPremio: teamMeta[t].premio, metaCom: teamMeta[t].com };
  for (const r of realizado) {
    const team = classifyRamo(r.ramo) as EquipeMeta; // pessoais | patrimoniais (excluídos já fora)
    if (!totals[team]) continue;
    totals[team].realPremio += r.premio; totals[team].realCom += r.com;
    totals.geral.realPremio += r.premio; totals.geral.realCom += r.com;
  }

  // Gráfico/apresentação semana a semana: por emissão. A emissão pode cair fora
  // das semanas do período (o registro já está garantido no período pela vigência);
  // nesse caso joga na semana da borda mais próxima para não sumir do gráfico.
  for (const r of realizado) {
    const team = classifyRamo(r.ramo) as EquipeMeta;
    const ds = r.em;
    if (!ds) continue;
    let w = weeks.find(w => ds >= w.startStr && ds <= w.endStr);
    if (!w) w = ds < weeks[0].startStr ? weeks[0] : weeks[weeks.length - 1];
    if (!w.byTeam[team]) continue;
    w.byTeam[team].realPremio += r.premio; w.byTeam[team].realCom += r.com;
    w.byTeam.geral.realPremio += r.premio; w.byTeam.geral.realCom += r.com;
  }
  return { hasPeriod: true, weeks, totals };
}

/** Cor do % da meta: ≥100% verde, ≥80% âmbar, abaixo vermelho. */
export const pctClsMeta = (p: number): string => (p >= 1 ? 'msem-ok' : p >= 0.8 ? 'msem-warn' : 'msem-bad');

export type DadosGraficoSemanal = { labels: string[]; real: number[]; meta: number[]; cor: string };
/** Série do ch-metas-semanal para a equipe/métrica escolhidas. */
export function graficoSemanal(weeks: SemanaMeta[], team: EquipeMeta, metric: MetricaSemana): DadosGraficoSemanal {
  const realKey = metric === 'comissao' ? 'realCom' : 'realPremio', metaKey = metric === 'comissao' ? 'metaCom' : 'metaPremio';
  return {
    labels: weeks.map(w => w.label),
    real: weeks.map(w => w.byTeam[team][realKey]),
    meta: weeks.map(w => w.byTeam[team][metaKey]),
    cor: METAS_SEM_TEAM_COLOR[team],
  };
}

export type LinhaTabelaSemanal = { semana: SemanaMeta; real: number; meta: number; pct: number; acReal: number; acMeta: number; pctAc: number };
export type TabelaSemanal = { linhas: LinhaTabelaSemanal[]; totReal: number; totMeta: number; totPct: number; totDias: number };
/** Tabela detalhada da equipe/métrica focadas, com acumulado; o total vem dos cartões (soma por vigência), não das semanas. */
export function tabelaSemanal(d: Extract<DadosSemanal, { hasPeriod: true }>, team: EquipeMeta, metric: MetricaSemana): TabelaSemanal {
  const realKey = metric === 'comissao' ? 'realCom' : 'realPremio', metaKey = metric === 'comissao' ? 'metaCom' : 'metaPremio';
  let acReal = 0, acMeta = 0;
  const linhas = d.weeks.map(semana => {
    const real = semana.byTeam[team][realKey], meta = semana.byTeam[team][metaKey];
    acReal += real; acMeta += meta;
    return { semana, real, meta, pct: meta ? real / meta : 0, acReal, acMeta, pctAc: acMeta ? acReal / acMeta : 0 };
  });
  const tt = d.totals[team];
  const totReal = tt[realKey], totMeta = tt[metaKey];
  return { linhas, totReal, totMeta, totPct: totMeta ? totReal / totMeta : 0, totDias: d.weeks.reduce((s, w) => s + w.days, 0) };
}
