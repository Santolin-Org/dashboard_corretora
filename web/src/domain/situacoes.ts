// ── Situações (coluna SITUAÇÃO) ────────────────────────────────────────────────
// O conjunto completo que a planilha emite. 'Renovada', 'Suspensa' e 'Perda Total'
// existiam nos dados muito antes de o código conhecê-las — daí a constante única,
// para não voltarmos a espalhar literais soltos por aí.
export const SIT = {
  ATIVA: 'Ativa', RENOVADA: 'Renovada', VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada', SUSPENSA: 'Suspensa', PERDA_TOTAL: 'Perda Total',
} as const;
// Desfechos de uma apólice que chegou ao término da vigência: renovou ou não voltou.
// É a base da taxa de renovação — Cancelada/Suspensa/Perda Total saíram por evento
// alheio à renovação (no meio da vigência), então não eram candidatas.
export const SIT_DESFECHO_RENOVACAO: string[] = [SIT.RENOVADA, SIT.VENCIDA];
// A planilha não é consistente na caixa ('Perda total' x 'Perda Total'): devolve a
// grafia de SIT quando bate sem diferenciar maiúsculas; senão preserva o texto.
const SIT_CANON = new Map<string, string>(Object.values(SIT).map(s => [s.toUpperCase(), s]));
export const normSit = (s: unknown): string => SIT_CANON.get(String(s || '').trim().toUpperCase()) || String(s || '').trim();

// Uma linha é a apólice em si (não endosso/fatura) quando não traz número de endosso.
// Cruzamos com TIPO DOCUMENTO porque as duas fontes divergem em registros legados.
export function isApolice(r: { endosso: string; tipoDoc: string }): boolean { return !r.endosso && r.tipoDoc === 'APÓLICE'; }

// O vínculo endosso→apólice é seguradora + número da apólice — o endosso repete o número da mãe.
export const chaveApolice = (r: { seg: string; apolice: string }): string => r.seg + '|' + r.apolice;
