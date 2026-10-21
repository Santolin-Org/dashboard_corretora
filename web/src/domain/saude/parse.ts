import * as XLSX from 'xlsx';
import type { DataISO } from '../tipos';
import { celulaParaISO, celulaParaMs } from '../datas';
import { normRamo } from '../ramos';
import { normSit } from '../situacoes';

export { SAUDE_FILE, SAUDE_MODELO } from './modelo';

// Cada campo aceita mais de uma grafia de cabeçalho (comparadas por normRamo).
export const SAUDE_COL: Record<string, string[]> = {
  apolice: ['APÓLICE', 'APOLICE', 'Nº APÓLICE'], cli: ['CLIENTE'], doc: ['CPF/CNPJ', 'CPF', 'CNPJ'],
  seg: ['SEGURADORA'], vig: ['INÍCIO DE VIGÊNCIA', 'VIGÊNCIA', 'INÍCIO VIGÊNCIA'], em: ['DATA EMISSÃO', 'EMISSÃO'],
  fim: ['TÉRMINO DE VIGÊNCIA'], tipo: ['TIPO DE NEGÓCIO', 'TIPO'], colab: ['COLABORADOR'],
  grp: ['GRUPO DE PRODUÇÃO'], sit: ['SITUAÇÃO'],
  premioLiq: ['PRÊMIO LÍQUIDO'], agencRS: ['AGENCIAMENTO R$'], comRS: ['COMISSÃO R$'],
  total: ['TOTAL RECEBIDO'],
};

export type LinhaSaude = {
  linha: number; apolice: string; cli: string; docDigits: string; seg: string;
  vig: DataISO; em: DataISO; fim: DataISO; tipo: string; colab: string; grp: string; sit: string;
  premio: number; com: number;
  /** Instante exato (ms) do Date de vig/em no antigo (só para a 1ª vigência do Cross-sell). */
  vigMs?: number; emMs?: number;
};
export type SaudeParse = { linhas: LinhaSaude[]; avisos: string[]; modificadoEm?: string };

// Número que pode vir digitado como texto: 'R$ 1.234,56', '1234.56', '2%'.
export function parseNumBR(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[R$\s%]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

// Valor vazio, zero ou negativo na planilha não sobrescreve o da produção (ver aplicar.ts).
export function parseSaude(buf: ArrayBuffer): SaudeParse {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  // Coluna de cada cabeçalho (normalizado), para ler o formato da célula de data.
  const colDe = new Map<string, number>();
  if (ws['!ref']) {
    const { s, e } = XLSX.utils.decode_range(ws['!ref']);
    for (let c = s.c; c <= e.c; c++) { const h = ws[XLSX.utils.encode_cell({ r: s.r, c })]?.v; if (h !== undefined) colDe.set(normRamo(h), c); }
  }
  const out: LinhaSaude[] = [], avisos: string[] = [];
  rows.forEach((raw, i) => {
    const byKey: Record<string, unknown> = {};
    Object.keys(raw).forEach(k => { byKey[normRamo(k)] = raw[k]; });
    const get = (campo: string): unknown => {
      for (const alias of SAUDE_COL[campo]) {
        const v = byKey[normRamo(alias)];
        if (v !== undefined && v !== '') return v;
      }
      return '';
    };
    // Instante do Date antigo da célula (data com formato de data vira o relógio de parede de São Paulo).
    const ms = (campo: string, iso: DataISO): number | undefined => {
      if (!iso) return undefined;
      const v = get(campo);
      let fmt = false;
      if (typeof v === 'number') {
        for (const alias of SAUDE_COL[campo]) {
          const c = colDe.get(normRamo(alias));
          if (c === undefined || byKey[normRamo(alias)] !== v) continue;
          const cel = ws[XLSX.utils.encode_cell({ r: (raw as { __rowNum__: number }).__rowNum__, c })];
          fmt = !!cel?.z && XLSX.SSF.is_date(cel.z);
          break;
        }
      }
      return celulaParaMs(v, fmt);
    };
    const apolice = String(get('apolice')).trim();
    const cli = String(get('cli')).trim();
    if (!apolice && !cli) return; // linha em branco
    const linha = i + 2; // +1 do cabeçalho, +1 porque o Excel conta a partir de 1
    const agencRS = parseNumBR(get('agencRS')), comRS = parseNumBR(get('comRS'));
    const totalTxt = get('total');
    const premio = Math.max(0, parseNumBR(get('premioLiq')));
    const com = Math.max(0, totalTxt !== '' ? parseNumBR(totalTxt) : agencRS + comRS);
    if (!premio && !com) { avisos.push(`linha ${linha} (${cli || apolice}): sem prêmio nem comissão — ignorada`); return; }
    const vig = celulaParaISO(get('vig')), em = celulaParaISO(get('em'));
    const vigMs = ms('vig', vig), emMs = ms('em', em);
    out.push({
      linha, apolice, cli, docDigits: String(get('doc')).replace(/\D/g, ''),
      seg: String(get('seg')).trim(), vig, em, fim: celulaParaISO(get('fim')),
      ...(vigMs !== undefined ? { vigMs } : {}), ...(emMs !== undefined ? { emMs } : {}),
      tipo: String(get('tipo')).trim().toUpperCase(), colab: String(get('colab')).trim(),
      grp: String(get('grp')).trim(), sit: normSit(get('sit')), premio, com,
    });
  });
  return { linhas: out, avisos };
}
