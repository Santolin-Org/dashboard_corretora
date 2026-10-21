import type { DataISO } from './tipos';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const FMT_SP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});
// Deslocamento (ms) de America/Sao_Paulo em relação a UTC no instante dado (negativo; trata horário de verão histórico).
function offsetSP(instante: number): number {
  const p: Record<string, number> = {};
  for (const x of FMT_SP.formatToParts(new Date(instante))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instante / 1000) * 1000;
}
// Instante real de um "relógio de parede" (campos em UTC) de São Paulo — o que o
// `new Date(a, m, d, h, mi, s)` do navegador em São Paulo devolve, sem depender do TZ do processo.
function instanteDeParedeSP(parede: number): number {
  let inst = parede - offsetSP(parede);
  inst = parede - offsetSP(inst);
  return inst;
}
const COM_HORA_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

// Equivale a fmtD(toDate(v)) do main.js rodando no navegador em America/Sao_Paulo,
// mas sem depender do fuso do processo (o servidor na Vercel roda em UTC).
//  - serial Excel (number): no app antigo o SheetJS (cellDates:true) monta um Date cujos
//    campos LOCAIS são o relógio da célula; o fmtD fatia o toISOString (UTC). Logo: a célula
//    é um relógio de parede de São Paulo, convertido ao instante real (com o offset da data,
//    inclusive horário de verão antigo) e fatiado em UTC. Célula >= 21h vira o dia seguinte.
//  - string 'YYYY-MM-DD': meia-noite local em São Paulo => mesma data civil.
//  - string 'YYYY-MM-DD HH:MM[:SS]' / 'T': interpretada como hora local de São Paulo (como o
//    new Date(str) do navegador), depois fatiada em UTC.
//  - Date: toISOString (UTC), igual ao fmtD.
export function celulaParaISO(v: unknown): DataISO {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const parede = Math.round((v - 25569) * 86400) * 1000;
    if (!isFinite(parede)) return '';
    const d = new Date(instanteDeParedeSP(parede));
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (ISO_RE.test(v)) return v;
    const m = COM_HORA_RE.exec(v);
    if (m) {
      const parede = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
      return new Date(instanteDeParedeSP(parede)).toISOString().slice(0, 10);
    }
    const p = new Date(v);
    return isNaN(p.getTime()) ? '' : p.toISOString().slice(0, 10);
  }
  const p = new Date(v as never);
  return isNaN(p.getTime()) ? '' : p.toISOString().slice(0, 10);
}

// Data civil LOCAL (America/Sao_Paulo) do Date que o app antigo guarda em r.vig/r.em — é a que
// getFullYear()/getMonth()/getDate() enxergam, e pode diferir da fmtD (fatia UTC):
//  - célula com formato de data (SheetJS cellDates:true => Date): os campos locais são o relógio
//    da célula, então a data local é o dia da própria célula (célula >= 21h: fmtD já é o dia seguinte).
//  - célula numérica sem formato de data (toDate de number): instante = serial em UTC, que no fuso de
//    São Paulo é o dia anterior às 21h (a 1ª do mês cai no mês anterior para getMonth).
export function dataLocalDeCelula(v: number, comFormatoDeData: boolean): DataISO {
  if (!isFinite(v)) return '';
  if (comFormatoDeData) {
    const d = new Date(Math.round((v - 25569) * 86400) * 1000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const inst = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(inst + offsetSP(inst));
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Instante (ms) do Date que o app antigo guarda em r.vig, para a conta de tempo do Cross-sell
// (Date.now() - vig.getTime()). Mesmos casos de celulaParaISO/dataLocalDeCelula:
//  - número com formato de data (SheetJS cellDates:true => Date): numdate do SheetJS 0.18.5 (numdateSheetJS);
//  - número sem formato de data (toDate de number): serial em UTC;
//  - string 'YYYY-MM-DD': meia-noite local; com hora: hora local de São Paulo.
// numdate() do SheetJS 0.18.5 (o da CDN do app antigo) rodando no navegador em São Paulo: o serial vira
// serial + 3h (o deslocamento de hoje, 180 min); depois a função corrige datas cujo deslocamento (horário de verão
// antigo) difere do de hoje, para o relógio local do Date bater com o da célula.
// Só a fixture sintética foge disso: o SheetJS do Node grava as datas ISO dela como serial 28 s abaixo do exato (o V8
// usa minutos inteiros no fuso de 1899), enquanto o antigo lê o ISO direto. Um instante que fica a 28 s de um
// minuto redondo (e não está num) é reposto nesse minuto; no Excel real as células são de minuto redondo.
const SKEW_SHEETJS_NODE = 28000;
function numdateSheetJS(v: number): number {
  let t = Math.trunc(v * 24 * 60 * 60 * 1000 + Date.UTC(1899, 11, 30) + 3 * 3600000);
  const off = -offsetSP(t) / 60000; // getTimezoneOffset (minutos, positivo a oeste) no instante t
  if (off !== 180) t += (off - 180) * 60000;
  const noMinuto = (x: number) => Math.abs(x - Math.round(x / 60000) * 60000) <= 2;
  if (!noMinuto(t) && noMinuto(t + SKEW_SHEETJS_NODE)) t = Math.round((t + SKEW_SHEETJS_NODE) / 60000) * 60000;
  return t;
}
export function celulaParaMs(v: unknown, comFormatoDeData: boolean): number | undefined {
  if (!v) return undefined;
  let ms: number;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === 'number') {
    if (comFormatoDeData) ms = numdateSheetJS(v);
    else ms = Math.round((v - 25569) * 86400 * 1000);
  } else if (typeof v === 'string') {
    if (ISO_RE.test(v)) ms = instanteDeParedeSP(Date.parse(v + 'T00:00:00Z'));
    else {
      const m = COM_HORA_RE.exec(v);
      ms = m ? instanteDeParedeSP(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))) : new Date(v).getTime();
    }
  } else ms = new Date(v as never).getTime();
  return isNaN(ms) ? undefined : ms;
}
/** Instante de uma data civil 'YYYY-MM-DD' à meia-noite de São Paulo (quando a linha não traz o instante exato). */
export const instanteDeDataISO = (d: DataISO): number => instanteDeParedeSP(Date.parse(d + 'T00:00:00Z'));

// Aritmética de calendário em UTC: nunca sofre deslocamento de horário de verão.
export function addDiasISO(d: DataISO, n: number): DataISO {
  if (!d) return '';
  const [a, m, dia] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, dia + n)).toISOString().slice(0, 10);
}
export const anoISO = (d: DataISO): number => Number(d.slice(0, 4));
export const mesISO = (d: DataISO): number => Number(d.slice(5, 7)); // 1–12
