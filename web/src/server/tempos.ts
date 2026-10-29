import type { TemposMontagem } from "./ingestao";

export type Etapa = { nome: string; ms: number; desc?: string };

/** Cabeçalho Server-Timing (o navegador mostra na aba Rede e expõe em performance.getEntries). */
export function cabecalhoServerTiming(etapas: Etapa[]): string {
  return etapas
    .map((e) => `${e.nome};dur=${Math.max(0, Math.round(e.ms))}${e.desc ? `;desc="${e.desc.replace(/["\\]/g, "")}"` : ""}`)
    .join(", ");
}

/** Etapas de uma montagem da base, para quem esperou por ela. */
export function etapasDaMontagem(t: TemposMontagem): Etapa[] {
  return [
    { nome: "listar", ms: t.listarMs, desc: "listagem da pasta" },
    { nome: "producao", ms: t.producaoMs, desc: `${t.lidas} lidas do xlsx, ${t.snapshots} de snapshot` },
    { nome: "fixos", ms: t.fixosMs, desc: "sinistros e saúde" },
    { nome: "montar", ms: t.montarMs, desc: "junção das planilhas" },
  ];
}
