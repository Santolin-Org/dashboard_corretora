import * as XLSX from 'xlsx';
import type { Linha } from '../tipos';
import { celulaParaISO, celulaParaMs, dataLocalDeCelula } from '../datas';
import { canonRamo, normRamo } from '../ramos';
import { normSit } from '../situacoes';

// ── Column mapping ─────────────────────────────────────────────────────────────
export const COL: Record<string, string> = {
  tipo: 'TIPO DE NEGÓCIO', vig: 'INÍCIO DE VIGÊNCIA', em: 'DATA EMISSÃO',
  fim: 'TÉRMINO DE VIGÊNCIA', cli: 'CLIENTE', seg: 'SEGURADORA',
  ramo: 'RAMO', grp: 'GRUPO DE PRODUÇÃO', premio: 'PRÊMIO', com: 'COMISSÃO',
  colab: 'COLABORADOR', sit: 'SITUAÇÃO', motivo: 'MOTIVO CANCELAMENTO', cancel: 'DATA CANCELAMENTO',
  doc: 'CPF/CNPJ', pessoa: 'TIPO PESSOA', tipoDoc: 'TIPO DOCUMENTO', campanha: 'CAMPANHA',
  // ATENÇÃO: 'APÓLICE' NÃO é chave única. Endossos e faturas repetem o número da
  // apólice-mãe a que estão vinculados e se distinguem pela numeração própria em
  // 'ENDOSSO'. Para isolar a apólice em si, exija endosso vazio (ver isApolice()).
  apolice: 'APÓLICE', endosso: 'ENDOSSO',
};

export function parseProducao(buf: ArrayBuffer): Linha[] {
  // cellDates:false (o antigo usa true): o SheetJS monta Date no fuso do processo. Com serial
  // numérico, celulaParaISO reproduz o Date de São Paulo do app antigo sem depender do TZ.
  // cellNF: guarda o formato da célula, para saber se a coluna de data é data de verdade (ver dataLocalDeCelula).
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const colunaDe = (nome: string): number => {
    const ref = ws['!ref']; if (!ref) return -1;
    const { s, e } = XLSX.utils.decode_range(ref);
    for (let c = s.c; c <= e.c; c++) if (String(ws[XLSX.utils.encode_cell({ r: s.r, c })]?.v ?? '') === nome) return c;
    return -1;
  };
  const cVig = colunaDe(COL.vig), cEm = colunaDe(COL.em);
  // Data local (SP) do Date antigo quando difere da ISO; só células numéricas têm o que reproduzir.
  const local = (r: Record<string, unknown>, c: number, nome: string, iso: string): string | undefined => {
    const v = r[nome];
    if (typeof v !== 'number' || c < 0) return undefined;
    const cel = ws[XLSX.utils.encode_cell({ r: (r as { __rowNum__: number }).__rowNum__, c })];
    const l = dataLocalDeCelula(v, !!cel?.z && XLSX.SSF.is_date(cel.z));
    return l && l !== iso ? l : undefined;
  };
  // Instante exato do Date de vig (ver celulaParaMs).
  const instante = (r: Record<string, unknown>, c: number): number | undefined => {
    const v = r[COL.vig];
    if (typeof v !== 'number' || c < 0) return celulaParaMs(v, false);
    const cel = ws[XLSX.utils.encode_cell({ r: (r as { __rowNum__: number }).__rowNum__, c })];
    return celulaParaMs(v, !!cel?.z && XLSX.SSF.is_date(cel.z));
  };
  return rows.map(r => {
    const docDigits = String(r[COL.doc] || '').replace(/\D/g, '');
    const pessoaTxt = normRamo(r[COL.pessoa]);
    // Fallback pelo tamanho do documento: o CNPJ nesta base vem com máscara de 15 dígitos
    // (ex: 032.259.341/0001-72), não os 14 padrão — por isso ">11" em vez de "===14".
    const tipoPessoa = pessoaTxt.startsWith('JUR') ? 'PJ' : pessoaTxt.startsWith('FIS') ? 'PF'
      : docDigits.length === 11 ? 'PF' : docDigits.length > 11 ? 'PJ' : '';
    const vig = celulaParaISO(r[COL.vig]), em = celulaParaISO(r[COL.em]);
    const vigLocal = local(r, cVig, COL.vig, vig), emLocal = local(r, cEm, COL.em, em);
    const vigMs = vig ? instante(r, cVig) : undefined;
    return {
      tipo: String(r[COL.tipo] || '').trim(), vig, em,
      ...(vigLocal ? { vigLocal } : {}), ...(emLocal ? { emLocal } : {}), ...(vigMs !== undefined ? { vigMs } : {}),
      fim: celulaParaISO(r[COL.fim]), cli: String(r[COL.cli] || ''), seg: String(r[COL.seg] || ''),
      ramo: canonRamo(r[COL.ramo]), grp: String(r[COL.grp] || ''),
      premio: parseFloat(String(r[COL.premio])) || 0, com: parseFloat(String(r[COL.com])) || 0,
      colab: String(r[COL.colab] || ''), sit: normSit(r[COL.sit]),
      motivo: String(r[COL.motivo] || ''), cancel: celulaParaISO(r[COL.cancel]),
      docDigits, tipoPessoa, tipoDoc: String(r[COL.tipoDoc] || '').trim(),
      campanha: String(r[COL.campanha] || '').trim(),
      apolice: String(r[COL.apolice] || '').trim(), endosso: String(r[COL.endosso] || '').trim(),
      trocaSeg: false,
    };
  });
}
