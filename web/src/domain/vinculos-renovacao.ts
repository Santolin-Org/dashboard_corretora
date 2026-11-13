// Vínculo manual de renovações (spec: docs/superpowers/specs/2026-11-13-vinculo-manual-renovacoes-design.md).
// A gestão diz "esta R é a renovação desta antiga" quando a ligação automática (CPF/CNPJ + ramo + ±1 dia) não acha,
// em geral porque o cliente renovou em outro nome (cônjuge, empresa) ou atrasado. Só R, com início até 90 dias depois
// do fim da antiga (regra da Santolin: depois disso é lançada como N). `ligarRenovacoes` aplica os pares antes do
// automático.
import type { DataISO, Linha } from './tipos';

export type ChaveVinculoAntiga = { seg: string; apolice: string; fim: DataISO };
export type ChaveVinculoRen = { renSeg: string; renApolice: string; renVig: DataISO };
export type VinculoRenovacao = ChaveVinculoAntiga & ChaveVinculoRen & { por: string; em: string };

export const chaveVinculoAntiga = (v: ChaveVinculoAntiga): string => `${v.seg}|${v.apolice}|${v.fim}`;
export const chaveVinculoRen = (v: ChaveVinculoRen): string => `${v.renSeg}|${v.renApolice}|${v.renVig}`;

export const JANELA_VINCULO_DIAS = 90;
const dia = (d: DataISO) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

/** A R pode ser renovação da antiga: começa até 90 dias depois do fim (antes do fim, sem limite: antecipada). */
export function dentroDaJanela(fimAntiga: DataISO, vigRen: DataISO): boolean {
  return !!fimAntiga && !!vigRen && dia(vigRen) - dia(fimAntiga) <= JANELA_VINCULO_DIAS;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Mesma regra da busca da lista: nome/apólice por trecho; só dígitos (com ou sem pontuação) também no CPF/CNPJ. */
function casa(termo: string, r: Linha): boolean {
  const t = normalizar(termo.trim());
  if (!t) return true;
  const digitos = /^[\d.\-/\s]+$/.test(t) ? t.replace(/\D/g, '') : '';
  if (digitos && r.docDigits.includes(digitos)) return true;
  return [r.cli, r.apolice, r.docDigits].some(c => normalizar(c).includes(t));
}

function ordenar(antigaDe: (x: Linha) => Linha, renDe: (x: Linha) => Linha) {
  return (x: Linha, y: Linha) => {
    const peso = (l: Linha) => (antigaDe(l).seg === renDe(l).seg && antigaDe(l).ramo === renDe(l).ramo ? 0 : 1);
    const dist = (l: Linha) => Math.abs(dia(renDe(l).vig) - dia(antigaDe(l).fim));
    return peso(x) - peso(y) || dist(x) - dist(y) || x.cli.localeCompare(y.cli, 'pt-BR');
  };
}

/** O par faz sentido no tempo: a R começa depois do início da antiga e até 90 dias depois do fim dela. */
const parPossivel = (a: Linha, r: Linha) => a !== r && !!a.vig && r.vig > a.vig && dentroDaJanela(a.fim, r.vig);

/** Diálogo A: R livres que podem ser a renovação de `antiga`. */
export function sugestoesRenovacao(antiga: Linha, livres: Linha[], termo: string): Linha[] {
  return livres
    .filter(r => parPossivel(antiga, r) && casa(termo, r))
    .sort(ordenar(() => antiga, r => r));
}

/** Diálogo B: antigas livres de que `ren` pode ser a renovação. */
export function sugestoesAntiga(ren: Linha, livres: Linha[], termo: string): Linha[] {
  return livres
    .filter(a => parPossivel(a, ren) && casa(termo, a))
    .sort(ordenar(a => a, () => ren));
}
