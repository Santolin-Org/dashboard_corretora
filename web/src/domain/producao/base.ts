import type { DataISO, Linha } from '../tipos';
import { addDiasISO, anoISO } from '../datas';
import { SIT, normSit, isApolice } from '../situacoes';
import { aplicarCobertura, type FonteProducao, type ManifestoFonte } from './cobertura';
import { applyMotivoEndosso, applyTrocaSeguradora } from './enriquecimentos';
import { aplicarSaude } from '../saude/aplicar';
import { SAUDE_FILE } from '../saude/modelo';
import type { SaudeParse } from '../saude/parse';

export type { FonteProducao, ManifestoFonte } from './cobertura';

// ── União de várias planilhas de produção ──────────────────────────────────────
// A base vive no SharePoint quebrada em um arquivo por ano (producao_2021.xlsx,
// producao_2022.xlsx, …). Cada arquivo é parseado isoladamente e concatenado.
//
// A chave de dedup é deliberadamente LARGA: 'APÓLICE' não identifica uma linha
// (endossos e faturas repetem o número da apólice-mãe — ver METRICAS.md §1.2), então
// só descartamos o que é byte a byte a mesma linha exportada duas vezes. Isso protege
// contra o caso real de sobreposição — o producao.xlsx legado convivendo com o
// producao_<ano>.xlsx — sem nunca fundir endossos distintos.
export function prodDedupeKey(r: Linha): string {
  return [r.apolice, r.endosso, r.tipoDoc, r.vig, r.em, r.cli, r.seg, r.ramo, r.premio, r.com].join('|');
}

// Intervalo de anos de início de vigência presente nas linhas — mostrado no painel
// de fontes para flagrar arquivo fora do ano que o nome promete.
// Sem Math.min(...anos): um arquivo de ano cheio passa de 100 mil linhas e o spread
// estoura a pilha de argumentos.
export function prodYearRange(rows: { vig: DataISO }[]): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    if (!r.vig) continue;
    const y = anoISO(r.vig);
    if (!y) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return min === Infinity ? null : { min, max };
}

// ── Arquivo de produção desatualizado ─────────────────────────────────────────
// Cada producao_<ano>.xlsx guarda a SITUAÇÃO do dia em que foi exportado. Se o
// arquivo de um ano anterior não for reexportado, a apólice que renovou depois
// continua 'Ativa' nele — e a sucessora também é 'Ativa' no arquivo novo: o mesmo
// contrato conta duas vezes (caso real: producao_2025 parado, 103 apólices assim).
// O sinal é apólice 'Ativa' com término de vigência já passado. A folga cobre o
// atraso normal do ERP em processar a renovação (um relatório recém-exportado tem
// poucas, ~5); a partir do limite o arquivo é apontado no painel de fontes.
export const ATIVA_VENCIDA_FOLGA_DIAS = 15;
export const ATIVA_VENCIDA_LIMITE_AVISO = 20;
export function contarAtivasVencidas(rows: Linha[], hoje: DataISO): number {
  const corte = addDiasISO(hoje, -ATIVA_VENCIDA_FOLGA_DIAS);
  return rows.filter(r => normSit(r.sit) === SIT.ATIVA && isApolice(r) && r.fim && r.fim < corte).length;
}
export const fontesDesatualizadas = (manifesto: ManifestoFonte[]) =>
  manifesto.filter(s => (s.ativasVencidas || 0) >= ATIVA_VENCIDA_LIMITE_AVISO);

// Cobertura → união com dedup "primeiro vence" na ordem das fontes → motivo do endosso
// → troca de seguradora → saúde lançado à parte (mesma ordem de loadProducaoFromSources).
export function montarBase(fontes: FonteProducao[], saude: SaudeParse | null, hoje: DataISO):
  { linhas: Linha[]; manifesto: ManifestoFonte[]; avisosSaude: string[] } {
  const cob = aplicarCobertura(fontes);
  const linhas: Linha[] = [];
  const vistas = new Set<string>();
  const manifesto: ManifestoFonte[] = [];
  cob.fontes.forEach((f, i) => {
    let dup = 0;
    for (const r of f.linhas) {
      const k = prodDedupeKey(r);
      if (vistas.has(k)) { dup++; continue; }
      vistas.add(k);
      linhas.push(r);
    }
    manifesto.push({
      nome: f.nome, total: fontes[i].linhas.length, duplicadas: dup, anos: prodYearRange(fontes[i].linhas),
      ativasVencidas: contarAtivasVencidas(f.linhas, hoje), modificadoEm: f.modificadoEm,
      anosIgnorados: cob.manifesto[i].anosIgnorados, sobreposicoes: cob.manifesto[i].sobreposicoes,
    });
  });
  applyMotivoEndosso(linhas);
  applyTrocaSeguradora(linhas, hoje);
  let avisosSaude: string[] = [];
  if (saude) {
    const r = aplicarSaude(linhas, saude, hoje);
    avisosSaude = r.avisos;
    manifesto.push({
      nome: SAUDE_FILE, total: saude.linhas.length, duplicadas: 0, anos: prodYearRange(saude.linhas),
      ativasVencidas: 0, modificadoEm: saude.modificadoEm ?? '', anosIgnorados: [], sobreposicoes: [],
      saude: { vinculadas: r.vinculadas, criadas: r.criadas, avisos: r.avisos },
    });
  }
  return { linhas, manifesto, avisosSaude };
}
