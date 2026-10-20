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

// Aritmética de calendário em UTC: nunca sofre deslocamento de horário de verão.
export function addDiasISO(d: DataISO, n: number): DataISO {
  if (!d) return '';
  const [a, m, dia] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, dia + n)).toISOString().slice(0, 10);
}
export const anoISO = (d: DataISO): number => Number(d.slice(0, 4));
export const mesISO = (d: DataISO): number => Number(d.slice(5, 7)); // 1–12
