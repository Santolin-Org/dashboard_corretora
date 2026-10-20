import type { DataISO } from './tipos';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Equivale a fmtD(toDate(v)) do main.js rodando no navegador em America/Sao_Paulo,
// mas sem depender do fuso do processo (o servidor na Vercel roda em UTC).
//  - serial Excel (number): o main.js faz new Date(round((v-25569)*86400000)) e fmtD
//    fatia o toISOString (UTC) — conta pura, independente de fuso.
//  - string 'YYYY-MM-DD': o main.js cria meia-noite local e fatia o UTC; em São Paulo
//    (UTC-3) a data civil não muda, então devolvemos a própria string.
//  - Date: toISOString (UTC), igual ao fmtD.
export function celulaParaISO(v: unknown): DataISO {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (ISO_RE.test(v)) return v;
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
