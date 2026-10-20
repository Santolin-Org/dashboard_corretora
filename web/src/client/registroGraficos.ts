"use client";
import type { ChartData } from "chart.js";

// Registro global que o harness de paridade lê: window.__charts[<id do canvas antigo>] = { data }.
// Equivale ao objeto `charts` do main.js (charts[id].data.labels / datasets[].data/label).
export type RegistroGrafico = { data: ChartData };

declare global {
  interface Window {
    __charts?: Record<string, RegistroGrafico>;
  }
}

export function registrarGrafico(id: string, data: ChartData): RegistroGrafico {
  const reg = { data };
  (window.__charts ??= {})[id] = reg;
  return reg;
}

/** Remove o registro, mas só se ainda for o mesmo (outro Grafico pode ter assumido o id). */
export function removerGrafico(id: string, reg: RegistroGrafico): void {
  if (window.__charts?.[id] === reg) delete window.__charts[id];
}
