"use client";

type Celula = string | number | boolean;
export type AbaPlanilha = { nome: string; linhas: Record<string, Celula>[] };

/** Monta um .xlsx (uma aba por item, json_to_sheet como o app antigo) e dispara o download. `xlsx` só carrega no clique. */
export async function baixarPlanilha(arquivo: string, abas: AbaPlanilha[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const a of abas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.linhas), a.nome);
  XLSX.writeFile(wb, arquivo);
}
