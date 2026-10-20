import type { Linha } from '../tipos';
import { anoISO } from '../datas';

export type FonteProducao = { nome: string; linhas: Linha[]; modificadoEm: string /* ISO datetime */ };
export type ManifestoFonte = {
  nome: string; total: number; duplicadas: number; anos: { min: number; max: number } | null;
  ativasVencidas: number; modificadoEm: string;
  anosIgnorados: { ano: number; cobertoPor: string }[];          // regra de cobertura
  sobreposicoes: { ano: number; com: string; linhas: number }[]; // abaixo de 50%: só aviso
  saude?: { vinculadas: number; criadas: number; avisos: string[] }; // só na pseudo-fonte saude_fernando.xlsx
};
export type ManifestoCobertura = Pick<ManifestoFonte, 'nome' | 'anosIgnorados' | 'sobreposicoes'>;

export const COBERTURA_FRACAO_MIN = 0.5;

// ── Regra de cobertura (nova, como proteção) ──────────────────────────────────
// Cada arquivo cobre os anos de início de vigência que contém. Quando dois arquivos
// cobrem o mesmo ano, vale inteiro o modificado por último naquele ano, e as linhas
// daquele ano no arquivo mais antigo são descartadas em bloco — mas só se o dono tiver,
// no ano, pelo menos 50% das linhas que o outro tem (proteção contra um endosso antigo
// perdido dentro de um arquivo de outro ano). Abaixo disso nada sai e fica só o aviso
// de sobreposição. A dedup linha a linha continua valendo depois, como segunda proteção.
export function aplicarCobertura(fontes: FonteProducao[]): { fontes: FonteProducao[]; manifesto: ManifestoCobertura[] } {
  // contagem de linhas por ano de vigência em cada fonte (sem spread: um ano passa de 100 mil linhas)
  const contagens = fontes.map(f => {
    const m = new Map<number, number>();
    for (const r of f.linhas) {
      if (!r.vig) continue;
      const y = anoISO(r.vig);
      if (!y) continue;
      m.set(y, (m.get(y) || 0) + 1);
    }
    return m;
  });
  const manifesto: ManifestoCobertura[] = fontes.map(f => ({ nome: f.nome, anosIgnorados: [], sobreposicoes: [] }));
  const descartar: Set<number>[] = fontes.map(() => new Set<number>());

  const anos = new Set<number>();
  contagens.forEach(m => m.forEach((_, y) => anos.add(y)));
  [...anos].sort((a, b) => a - b).forEach(y => {
    const com = fontes.map((_, i) => i).filter(i => contagens[i].has(y));
    if (com.length < 2) return;
    // dona: modificada por último; empate fica com a que vem depois na ordem
    let dona = com[0];
    for (const i of com) if (Date.parse(fontes[i].modificadoEm) >= Date.parse(fontes[dona].modificadoEm)) dona = i;
    const nDona = contagens[dona].get(y) as number;
    for (const i of com) {
      if (i === dona) continue;
      const nF = contagens[i].get(y) as number;
      if (nDona >= COBERTURA_FRACAO_MIN * nF) {
        descartar[i].add(y);
        manifesto[i].anosIgnorados.push({ ano: y, cobertoPor: fontes[dona].nome });
      } else {
        manifesto[i].sobreposicoes.push({ ano: y, com: fontes[dona].nome, linhas: nF });
        manifesto[dona].sobreposicoes.push({ ano: y, com: fontes[i].nome, linhas: nDona });
      }
    }
  });

  const saida = fontes.map((f, i) => descartar[i].size === 0 ? f
    : { ...f, linhas: f.linhas.filter(r => !(r.vig && descartar[i].has(anoISO(r.vig)))) });
  return { fontes: saida, manifesto };
}
