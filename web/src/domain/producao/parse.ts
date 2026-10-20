import * as XLSX from 'xlsx';
import type { Linha } from '../tipos';
import { celulaParaISO } from '../datas';
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
  // cellDates:false (o antigo usa true): o SheetJS monta Date no fuso do processo, o que
  // mudaria o dia no servidor UTC. Com serial numérico, celulaParaISO é pura e dá o mesmo
  // dia civil que o fmtD do navegador em São Paulo.
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map(r => {
    const docDigits = String(r[COL.doc] || '').replace(/\D/g, '');
    const pessoaTxt = normRamo(r[COL.pessoa]);
    // Fallback pelo tamanho do documento: o CNPJ nesta base vem com máscara de 15 dígitos
    // (ex: 032.259.341/0001-72), não os 14 padrão — por isso ">11" em vez de "===14".
    const tipoPessoa = pessoaTxt.startsWith('JUR') ? 'PJ' : pessoaTxt.startsWith('FIS') ? 'PF'
      : docDigits.length === 11 ? 'PF' : docDigits.length > 11 ? 'PJ' : '';
    return {
      tipo: String(r[COL.tipo] || '').trim(), vig: celulaParaISO(r[COL.vig]), em: celulaParaISO(r[COL.em]),
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
