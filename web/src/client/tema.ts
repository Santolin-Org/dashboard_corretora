"use client";
import { useSyncExternalStore } from "react";

// ── Theme Responsiveness (main.js 171–199) ─────────────────────────────────────
// O tema segue o sistema (prefers-color-scheme). Os gráficos leem as cores abaixo na
// hora de montar a configuração; quem usa `useTema()` re-renderiza quando o tema muda
// (no app antigo: darkQuery 'change' → render() das abas ativas).
const CONSULTA = "(prefers-color-scheme:dark)";
const consulta = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(CONSULTA) : null;

export const dark = (): boolean => consulta()?.matches ?? true; // o CSS é dark-first
export const axisClr = (): string => (dark() ? "#8b949e" : "#888");
export const gridClr = (): string => (dark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.055)");
export const labelClr = (): string => (dark() ? "#c9d1d9" : "#444");
export const borderClr = (): string => (dark() ? "#161b22" : "#fff");
// Canvas não enxerga variável CSS: lê o valor computado para os rótulos desenhados
// no gráfico usarem exatamente o mesmo verde/vermelho das badges de variação.
export const cssVar = (n: string): string =>
  typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const posClr = (): string => cssVar("--pos-text") || "#2DD4A0";
export const negClr = (): string => cssVar("--neg-text") || "#FF8080";

export const PALETA = ["#378ADD", "#639922", "#E24B4A", "#BA7517", "#534AB7", "#1D9E75", "#D4537E", "#888780", "#5DCAA5", "#F09595", "#97C459", "#BC8CFF"];

function assinar(cb: () => void): () => void {
  const q = consulta();
  if (!q) return () => {};
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
}

/** true = escuro. Re-renderiza o componente quando o tema do sistema muda. */
export function useTema(): boolean {
  return useSyncExternalStore(assinar, dark, () => true);
}
