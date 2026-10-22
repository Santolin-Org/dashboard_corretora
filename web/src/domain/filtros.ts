import type { DataISO, Linha } from './tipos';
import { saudeFaturaConta } from './saude/aplicar';

// ── Filtros globais (main.js 1394–1520: populateFilters, buildColabOptions, applyFilters) ──
// Datas vazias ('') = sem limite. Listas vazias = todos.
export type FiltrosGlobais = {
  vigIni: DataISO; vigFim: DataISO; emIni: DataISO; emFim: DataISO;
  tipos: string[]; col: string[]; grp: string[]; ram: string[]; seg: string[];
};

export const FILTROS_VAZIOS: FiltrosGlobais = Object.freeze({
  vigIni: '', vigFim: '', emIni: '', emFim: '', tipos: [], col: [], grp: [], ram: [], seg: [],
}) as FiltrosGlobais;

export const TIPO_LABELS: Record<string, string> = {
  R: 'R — Renovação', N: 'N — Negócio novo', ER: 'ER — Endosso renov.', EN: 'EN — Endosso novo',
  CR: 'CR — Cancel. renov.', CN: 'CN — Cancel. novo',
};

/** applyFilters → FD. A linha sem a data passa no filtro dessa data. */
export function filtrarLinhas(l: Linha[], f: FiltrosGlobais): Linha[] {
  const { vigIni: vs, vigFim: ve, emIni: es, emFim: ee } = f;
  const col = new Set(f.col), grp = new Set(f.grp), ram = new Set(f.ram), seg = new Set(f.seg);
  const tipos = new Set(f.tipos);
  return l.filter(r => {
    if (vs && r.vig && r.vig < vs) return false; if (ve && r.vig && r.vig > ve) return false;
    if (es && r.em && r.em < es) return false; if (ee && r.em && r.em > ee) return false;
    if (col.size > 0 && !col.has(r.colab)) return false;
    if (grp.size > 0 && !grp.has(r.grp)) return false;
    if (ram.size > 0 && !ram.has(r.ramo)) return false;
    if (seg.size > 0 && !seg.has(r.seg)) return false;
    if (tipos.size > 0 && !tipos.has(r.tipo)) return false;
    if (!saudeFaturaConta(r, tipos)) return false;
    return true;
  });
}

// ── Colaboradores com produção no período ──────────────────────────────────────
// O seletor de colaborador só oferece quem tem produção (N, R, EN, ER) dentro das
// datas do filtro — sem datas, quem tem produção em qualquer período. Quem já está
// marcado (f.col) continua na lista mesmo sem produção.
export const TIPOS_PRODUCAO = ['N', 'R', 'EN', 'ER'];
const entre = (d: DataISO, s: DataISO, e: DataISO) => !d || ((!s || d >= s) && (!e || d <= e));

export function colabsComProducao(l: Linha[], dentro: (r: Linha) => boolean, marcados: Iterable<string>): string[] {
  const set = new Set(marcados);
  for (const r of l) if (r.colab && TIPOS_PRODUCAO.includes(r.tipo) && dentro(r)) set.add(r.colab);
  return [...set].sort();
}

const uniq = (l: Linha[], campo: 'grp' | 'ramo' | 'seg' | 'tipo'): string[] => {
  const s = new Set<string>();
  for (const r of l) if (r[campo]) s.add(r[campo]);
  return [...s].sort();
};

/** Opções dos seletores globais. `col` segue a regra de "Colaboradores com produção no período". */
export function opcoesFiltros(l: Linha[], f: FiltrosGlobais): { col: string[]; grp: string[]; ram: string[]; seg: string[] } {
  return {
    col: colabsComProducao(l, r => entre(r.vig, f.vigIni, f.vigFim) && entre(r.em, f.emIni, f.emFim), f.col),
    grp: uniq(l, 'grp'),
    ram: uniq(l, 'ramo'),
    seg: uniq(l, 'seg'),
  };
}

/** buildTipoBtns: tipos presentes na base, em ordem de sort(). */
export const tiposDisponiveis = (l: Linha[]): string[] => uniq(l, 'tipo');
