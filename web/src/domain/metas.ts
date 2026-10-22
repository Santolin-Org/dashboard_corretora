// Aba Metas (main.js 3666–4662, sem o modo apresentação): cálculos puros, sem DOM. Definições em METRICAS.md (Metas).
// A meta não vem de planilha nem de constante: é a produção/comissão do MESMO período do ano anterior (a "base")
// multiplicada por (1 + % de meta) — um % para Novos e outro para Renovações, digitados na própria aba (padrão 10%).
import type { DataISO, Linha } from './tipos';
import type { FiltrosGlobais } from './filtros';
import { classifyRamo, metaTipoSide } from './ramos';
import { saudeFaturaConta } from './saude/aplicar';

/** `value="10"` dos dois inputs (#meta-novos-pct, #meta-renov-pct) no index.html. */
export const META_PCT_INICIAL = '10';
/** Estado inicial da ordenação da tabela por colaborador (`metaSortKey`/`metaSortDir` do topo do main.js). */
export const ORDEM_METAS_INICIAL: OrdemMetas = { chave: 'totalAnt', dir: 'desc' };

export type OrdemMetas = { chave: ChaveMetas; dir: 'asc' | 'desc' };

/** getMetaPcts: parseFloat do texto do input, vazio/inválido = 0; devolve fração. */
export function getMetaPcts(novosTxt: string, renovTxt: string): { mn: number; mr: number } {
  return { mn: (parseFloat(novosTxt) || 0) / 100, mr: (parseFloat(renovTxt) || 0) / 100 };
}

export type PeriodoBase = { startStr: DataISO; endStr: DataISO };

/**
 * getMetasBasePeriod: com vigência global (as duas pontas), a base é o mesmo período um ano antes (troca só o ano na
 * string, sem fuso, como a aba Produção); sem ela, o ano civil anterior ao de "hoje".
 */
export function getMetasBasePeriod(f: Pick<FiltrosGlobais, 'vigIni' | 'vigFim'>, hoje: DataISO): PeriodoBase {
  const vs = f.vigIni, ve = f.vigFim;
  if (vs && ve) {
    return { startStr: (parseInt(vs.slice(0, 4), 10) - 1) + vs.slice(4), endStr: (parseInt(ve.slice(0, 4), 10) - 1) + ve.slice(4) };
  }
  const year = parseInt(hoje.slice(0, 4), 10) - 1;
  return { startStr: `${year}-01-01`, endStr: `${year}-12-31` };
}

const ML = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/**
 * `Base: dd/mmm/aaaa – dd/mmm/aaaa` (renderMetasTab). O antigo passa pelo Date: uma data inexistente após o deslocamento
 * (29/fev de ano bissexto → 29/fev do ano anterior) rola para 01/mar, só no rótulo (o filtro compara a string).
 */
export function rotuloBaseMetas(p: PeriodoBase): string {
  const fmt = (s: DataISO) => {
    const [a, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${ML[dt.getUTCMonth()]}/${dt.getUTCFullYear()}`;
  };
  return `Base: ${fmt(p.startStr)} – ${fmt(p.endStr)}`;
}

/**
 * filterMetasData: base da meta (período do ano anterior). Só N, R, EN e ER entram; honra os botões de tipo pelo tipo
 * literal marcado (marcar só "N" traz só N, sem EN) e o filtro de colaborador/grupo/ramo/seguradora. Vigência por
 * comparação de string (como a aba Produção); linha sem vigência fica de fora. Ramos fora da meta saem, salvo
 * `incluirExcluidos` (a nota de conferência).
 */
export function filtrarMetas(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO, opts: { incluirExcluidos?: boolean } = {}): Linha[] {
  const { startStr, endStr } = getMetasBasePeriod(f, hoje);
  const tipos = new Set(f.tipos), col = new Set(f.col), grp = new Set(f.grp), ram = new Set(f.ram), seg = new Set(f.seg);
  return linhas.filter(r => {
    if (!metaTipoSide(r.tipo)) return false; // só N, R, EN, ER entram na meta
    if (tipos.size && !tipos.has(r.tipo)) return false;
    if (!saudeFaturaConta(r, tipos)) return false;
    const ds = r.vig;
    if (!ds) return false;
    if (ds < startStr || ds > endStr) return false;
    if (col.size && !col.has(r.colab)) return false;
    if (grp.size && !grp.has(r.grp)) return false;
    if (ram.size && !ram.has(r.ramo)) return false;
    if (seg.size && !seg.has(r.seg)) return false;
    if (!opts.incluirExcluidos && classifyRamo(r.ramo) === 'excluded') return false;
    return true;
  });
}

/**
 * getMetasRealizadoData: produção realizada no período de vigência selecionado, mesmo escopo da meta (N/R/EN/ER,
 * ramos que contam, filtros globais e botões de tipo). Não desloca o ano.
 */
export function getMetasRealizadoData(linhas: Linha[], f: FiltrosGlobais): Linha[] {
  const vs = f.vigIni, ve = f.vigFim;
  const tipos = new Set(f.tipos), col = new Set(f.col), grp = new Set(f.grp), ram = new Set(f.ram), seg = new Set(f.seg);
  return linhas.filter(r => {
    if (!metaTipoSide(r.tipo)) return false;
    if (tipos.size && !tipos.has(r.tipo)) return false;
    if (!saudeFaturaConta(r, tipos)) return false;
    const ds = r.vig;
    if (!ds) return false;
    if (vs && ds < vs) return false;
    if (ve && ds > ve) return false;
    if (col.size && !col.has(r.colab)) return false;
    if (grp.size && !grp.has(r.grp)) return false;
    if (ram.size && !ram.has(r.ramo)) return false;
    if (seg.size && !seg.has(r.seg)) return false;
    if (classifyRamo(r.ramo) === 'excluded') return false;
    return true;
  });
}

// ── Tabela por colaborador ────────────────────────────────────────────────────
export type LinhaMetasColab = {
  nome: string; np: number; nc: number; rp: number; rc: number;
  totalAnt: number; totalComAnt: number; metaNProd: number; metaNCom: number; metaRProd: number; metaRCom: number;
  metaTotalProd: number; metaTotalCom: number; pctComAnt: number; pctMetaCom: number;
};
export type ChaveMetas = keyof LinhaMetasColab;

/** buildMetasGroupData (ordem de inserção por colaborador, como o Object.values do antigo). */
export function buildMetasGroupData(data: Linha[], mn: number, mr: number): LinhaMetasColab[] {
  const map = new Map<string, { nome: string; np: number; nc: number; rp: number; rc: number }>();
  for (const r of data) {
    const k = r.colab || '—';
    let v = map.get(k);
    if (!v) { v = { nome: k, np: 0, nc: 0, rp: 0, rc: 0 }; map.set(k, v); }
    if (metaTipoSide(r.tipo) === 'N') { v.np += r.premio; v.nc += r.com; }
    else { v.rp += r.premio; v.rc += r.com; }
  }
  return [...map.values()].map(v => {
    const totalAnt = v.np + v.rp, totalComAnt = v.nc + v.rc;
    const metaNProd = v.np * (1 + mn), metaNCom = v.nc * (1 + mn);
    const metaRProd = v.rp * (1 + mr), metaRCom = v.rc * (1 + mr);
    const metaTotalProd = metaNProd + metaRProd, metaTotalCom = metaNCom + metaRCom;
    const pctComAnt = totalAnt ? totalComAnt / totalAnt : 0;
    const pctMetaCom = metaTotalProd ? metaTotalCom / metaTotalProd : 0;
    return { ...v, totalAnt, totalComAnt, metaNProd, metaNCom, metaRProd, metaRCom, metaTotalProd, metaTotalCom, pctComAnt, pctMetaCom };
  });
}

/** setMetasSort: mesma coluna inverte; coluna nova começa em desc. */
export function alternarOrdemMetas(o: OrdemMetas, chave: ChaveMetas): OrdemMetas {
  return o.chave === chave ? { chave, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { chave, dir: 'desc' };
}

/** Ordena (cópia) como o sort do renderMetasColabTable: texto por localeCompare, número por diferença. */
export function ordenarMetasColab(rows: LinhaMetasColab[], o: OrdemMetas): LinhaMetasColab[] {
  return [...rows].sort((a, b) => {
    const va = a[o.chave] ?? 0, vb = b[o.chave] ?? 0;
    if (typeof va === 'string') return o.dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return o.dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

/** Nome curto do colaborador na tabela: antes de " - " e de "|". */
export const nomeCurtoColab = (nome: string): string => nome.split(' - ')[0].split('|')[0].trim();

export type TotaisMetasColab = {
  np: number; nc: number; rp: number; rc: number; totalAnt: number; totalComAnt: number; metaTotalProd: number; metaTotalCom: number;
  metaNProd: number; metaNCom: number; metaRProd: number; metaRCom: number;
};
/** Linha "Total geral" (soma das linhas; reduce na mesma ordem do antigo). */
export function totaisMetasColab(rows: LinhaMetasColab[]): TotaisMetasColab {
  const soma = (k: keyof LinhaMetasColab) => rows.reduce((s, r) => s + (r[k] as number), 0);
  return {
    np: soma('np'), nc: soma('nc'), rp: soma('rp'), rc: soma('rc'), totalAnt: soma('totalAnt'), totalComAnt: soma('totalComAnt'),
    metaTotalProd: soma('metaTotalProd'), metaTotalCom: soma('metaTotalCom'),
    metaNProd: soma('metaNProd'), metaNCom: soma('metaNCom'), metaRProd: soma('metaRProd'), metaRCom: soma('metaRCom'),
  };
}

// ── Cards por equipe ──────────────────────────────────────────────────────────
export type CardEquipe = { baseProd: number; baseCom: number; metaProd: number; metaCom: number; pctMetaCom: number; ramos: string[] };
export type CardsEquipe = { pessoais: CardEquipe; patrimoniais: CardEquipe; geral: CardEquipe; excluded: string[] };

/** buildMetasEquipeCards. Os ramos de cada equipe saem ordenados; os do Geral são pessoais seguidos de patrimoniais. */
export function buildMetasEquipeCards(linhas: Linha[], f: FiltrosGlobais, hoje: DataISO, mn: number, mr: number): CardsEquipe {
  const data = filtrarMetas(linhas, f, hoje); // já remove ramos fora da meta
  const blank = () => ({ np: 0, nc: 0, rp: 0, rc: 0, ramos: new Set<string>() });
  const acc = { pessoais: blank(), patrimoniais: blank() };
  for (const r of data) {
    const t = acc[classifyRamo(r.ramo) as 'pessoais' | 'patrimoniais'];
    if (!t) continue;
    if (metaTipoSide(r.tipo) === 'N') { t.np += r.premio; t.nc += r.com; }
    else { t.rp += r.premio; t.rc += r.com; }
    if (r.ramo) t.ramos.add(r.ramo);
  }
  const summarize = (a: ReturnType<typeof blank>): CardEquipe => {
    const baseProd = a.np + a.rp, baseCom = a.nc + a.rc;
    const metaProd = a.np * (1 + mn) + a.rp * (1 + mr);
    const metaCom = a.nc * (1 + mn) + a.rc * (1 + mr);
    return { baseProd, baseCom, metaProd, metaCom, pctMetaCom: metaProd ? metaCom / metaProd : 0, ramos: [...a.ramos].sort() };
  };
  const pessoais = summarize(acc.pessoais), patrimoniais = summarize(acc.patrimoniais);
  const geral: CardEquipe = {
    baseProd: pessoais.baseProd + patrimoniais.baseProd,
    baseCom: pessoais.baseCom + patrimoniais.baseCom,
    metaProd: pessoais.metaProd + patrimoniais.metaProd,
    metaCom: pessoais.metaCom + patrimoniais.metaCom,
    pctMetaCom: 0,
    ramos: [...pessoais.ramos, ...patrimoniais.ramos],
  };
  geral.pctMetaCom = geral.metaProd ? geral.metaCom / geral.metaProd : 0;
  // Ramos excluídos detectados no período base (para conferência).
  const excl = new Set<string>();
  for (const r of filtrarMetas(linhas, f, hoje, { incluirExcluidos: true })) {
    if (r.ramo && classifyRamo(r.ramo) === 'excluded') excl.add(r.ramo);
  }
  return { pessoais, patrimoniais, geral, excluded: [...excl].sort() };
}

// ── Exportações (exportMetasData) ─────────────────────────────────────────────
export function exportacaoMetasColab(data: Linha[], mn: number, mr: number): Record<string, string | number>[] {
  return buildMetasGroupData(data, mn, mr).map(r => ({
    'Colaborador': r.nome,
    'Prod. Novos (base)': r.np, 'Com. Novos (base)': r.nc, '% Com. Novos': r.np ? r.nc / r.np : 0,
    'Meta Prod. Novos': r.metaNProd, 'Meta Com. Novos': r.metaNCom,
    'Prod. Renov. (base)': r.rp, 'Com. Renov. (base)': r.rc, '% Com. Renov.': r.rp ? r.rc / r.rp : 0,
    'Meta Prod. Renov.': r.metaRProd, 'Meta Com. Renov.': r.metaRCom,
    'Total Prod. Ant.': r.totalAnt, 'Total Com. Ant.': r.totalComAnt, '% Com. Total Ant.': r.pctComAnt,
    'Meta Prod. Total': r.metaTotalProd, 'Meta Com. Total': r.metaTotalCom, '% Com. Meta Total': r.pctMetaCom,
  }));
}

export function exportacaoMetasEquipe(data: Linha[], mn: number, mr: number): Record<string, string | number>[] {
  const byRamo: Record<string, { np: number; nc: number; rp: number; rc: number }> = {};
  for (const r of data) {
    const k = r.ramo || '—';
    if (!byRamo[k]) byRamo[k] = { np: 0, nc: 0, rp: 0, rc: 0 };
    if (metaTipoSide(r.tipo) === 'N') { byRamo[k].np += r.premio; byRamo[k].nc += r.com; }
    else { byRamo[k].rp += r.premio; byRamo[k].rc += r.com; }
  }
  return Object.entries(byRamo).map(([ramo, v]) => {
    const tAnt = v.np + v.rp, tCom = v.nc + v.rc;
    const mProd = v.np * (1 + mn) + v.rp * (1 + mr), mCom = v.nc * (1 + mn) + v.rc * (1 + mr);
    return { 'Equipe': classifyRamo(ramo) === 'pessoais' ? 'Pessoal' : 'Patrimonial', 'Ramo': ramo, 'Prod. N (base)': v.np, 'Prod. R (base)': v.rp, 'Total Prod. Ant.': tAnt, 'Meta Prod.': mProd, 'Com. Ant.': tCom, 'Meta Com.': mCom, '% Com. Ant.': tAnt ? tCom / tAnt : 0, '% Com. Meta': mProd ? mCom / mProd : 0 };
  }).sort((a, b) => (a['Equipe'] as string).localeCompare(b['Equipe'] as string) || (b['Total Prod. Ant.'] as number) - (a['Total Prod. Ant.'] as number));
}
