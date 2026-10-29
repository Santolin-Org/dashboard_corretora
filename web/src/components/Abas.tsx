// Abas do painel: cada uma é uma rota (a navegação fica na BarraLateral).
export const ABAS = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "producao", rotulo: "Produção" },
  { id: "retencao", rotulo: "Retenção & Churn" },
  { id: "crosssell", rotulo: "Cross-sell" },
  { id: "comparativo", rotulo: "Comparativo" },
  { id: "metas", rotulo: "Metas" },
  { id: "sinistros", rotulo: "Sinistros" },
] as const;
export type AbaId = (typeof ABAS)[number]["id"];

/** Abas que dependem da produção (PROD_TABS do main.js). */
export const ABAS_PRODUCAO: readonly string[] = ["visao-geral", "producao", "retencao", "comparativo", "metas", "crosssell"];
