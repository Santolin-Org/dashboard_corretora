export type Snapshot = {
  /** id → textContent com espaços colapsados e trim */
  textos: Record<string, string>;
  graficos: Record<string, { labels: string[]; datasets: { label?: string; data: (number | null)[] }[] }>;
};

export const colapsar = (s: string) => s.replace(/\s+/g, " ").trim();
