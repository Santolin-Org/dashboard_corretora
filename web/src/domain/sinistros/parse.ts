import * as XLSX from 'xlsx';
import type { DataISO } from '../tipos';
import { celulaParaISO } from '../datas';
import { canonRamo } from '../ramos';

export const COL_SIN = {
  id: 'Nº AVISO', sinNum: 'Nº SINISTRO', abertura: 'DATA SINISTRO', aviso: 'DATA AVISO', encerra: 'DATA LIQUIDADO',
  status: 'SITUAÇÃO DO SINISTRO', seg: 'SEGURADORA', ramo: 'RAMO', cli: 'SEGURADO', valor: 'APURADO',
  pago: 'INDENIZADO', impSeg: 'IMP. SEG.', franquia: 'FRANQUIA', prejEst: 'PREJ. ESTIMADO', premioPago: 'PRÊMIO PAGO',
  motivo: 'MOTIVO DO SINISTRO', tipoSin: 'TIPO DE SINISTRO', colab: 'COLABORADOR', grp: 'GRUPO ECONÔMICO',
} as const;

export type Sinistro = {
  id: string; sinNum: string; abertura: DataISO; aviso: DataISO; encerra: DataISO; status: string; seg: string;
  ramo: string; cli: string; valor: number; pago: number; impSeg: number; franquia: number; prejEst: number;
  premioPago: number; motivo: string; tipoSin: string; colab: string; grp: string;
};

export const claimDedupeKey = (r: { id: string; sinNum: string }): string | null => {
  const id = (r.id || r.sinNum || '').trim();
  return id || null;
};

export function mergeClaimsRows(target: Sinistro[], incoming: Sinistro[]): void {
  const seen = new Set(target.map(claimDedupeKey).filter(Boolean));
  incoming.forEach(r => {
    const k = claimDedupeKey(r);
    if (k) {
      if (seen.has(k)) return;
      seen.add(k);
    }
    target.push(r);
  });
}

export function parseSinistros(buf: ArrayBuffer): Sinistro[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const t = (v: unknown) => String(v || '').trim();
  const n = (v: unknown) => parseFloat(String(v)) || 0;
  return rows.map(r => ({
    id: t(r[COL_SIN.id]), sinNum: t(r[COL_SIN.sinNum]),
    abertura: celulaParaISO(r[COL_SIN.abertura]), aviso: celulaParaISO(r[COL_SIN.aviso]), encerra: celulaParaISO(r[COL_SIN.encerra]),
    status: t(r[COL_SIN.status]), seg: t(r[COL_SIN.seg]), ramo: canonRamo(r[COL_SIN.ramo]), cli: t(r[COL_SIN.cli]),
    valor: n(r[COL_SIN.valor]), pago: n(r[COL_SIN.pago]), impSeg: n(r[COL_SIN.impSeg]), franquia: n(r[COL_SIN.franquia]),
    prejEst: n(r[COL_SIN.prejEst]), premioPago: n(r[COL_SIN.premioPago]),
    motivo: t(r[COL_SIN.motivo]), tipoSin: t(r[COL_SIN.tipoSin]), colab: t(r[COL_SIN.colab]), grp: t(r[COL_SIN.grp]),
  }));
}

// Avisados primeiro, depois pagamentos; a dedup por Nº AVISO (ou Nº SINISTRO) mantém o primeiro.
export function montarSinistros(avisados: ArrayBuffer | null, pagamentos: ArrayBuffer | null):
  { sinistros: Sinistro[]; contagens: { sinistrosAvisados: number; sinistrosPagamentos: number } } {
  const sinistros: Sinistro[] = [];
  const contagens = { sinistrosAvisados: 0, sinistrosPagamentos: 0 };
  if (avisados) {
    const rows = parseSinistros(avisados);
    contagens.sinistrosAvisados = rows.length;
    mergeClaimsRows(sinistros, rows);
  }
  if (pagamentos) {
    const rows = parseSinistros(pagamentos);
    contagens.sinistrosPagamentos = rows.length;
    mergeClaimsRows(sinistros, rows);
  }
  return { sinistros, contagens };
}
