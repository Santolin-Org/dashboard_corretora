import { colapsar, type Snapshot } from "./snapshot";

export type Diferenca = {
  cenario: string;
  tipo: "texto" | "grafico" | "ausente-no-novo" | "sobra-no-novo";
  id: string;
  antigo?: unknown;
  novo?: unknown;
};

export const TOLERANCIA = 1e-9;

const norm = (s: string) => colapsar(s.replace(/ /g, " "));

/** Janela curta em volta do primeiro caractere diferente (o textContent do contêiner inteiro é enorme). */
function janela(a: string, b: string, raio = 60): { antigo: string; novo: string; posicao: number } {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const corta = (s: string) => {
    const ini = Math.max(0, i - raio);
    const fim = Math.min(s.length, i + raio);
    return `${ini > 0 ? "…" : ""}${s.slice(ini, fim)}${fim < s.length ? "…" : ""}`;
  };
  return { antigo: corta(a), novo: corta(b), posicao: i };
}

type Grafico = Snapshot["graficos"][string];

function graficosIguais(a: Grafico, b: Grafico): boolean {
  if (a.labels.length !== b.labels.length || a.labels.some((l, i) => l !== b.labels[i])) return false;
  if (a.datasets.length !== b.datasets.length) return false;
  return a.datasets.every((da, k) => {
    const db = b.datasets[k];
    if (da.label !== db.label || da.data.length !== db.data.length) return false;
    return da.data.every((x, i) => {
      const y = db.data[i];
      if (x === null || y === null) return x === y;
      return Math.abs(x - y) <= TOLERANCIA;
    });
  });
}

export function compararSnapshots(cenario: string, antigo: Snapshot, novo: Snapshot): Diferenca[] {
  const out: Diferenca[] = [];
  for (const [id, ta] of Object.entries(antigo.textos)) {
    if (!(id in novo.textos)) { out.push({ cenario, tipo: "ausente-no-novo", id }); continue; }
    const a = norm(ta);
    const b = norm(novo.textos[id]);
    if (a !== b) {
      const j = janela(a, b);
      out.push({ cenario, tipo: "texto", id, antigo: j.antigo, novo: j.novo });
    }
  }
  for (const [id, ga] of Object.entries(antigo.graficos)) {
    if (!(id in novo.graficos)) { out.push({ cenario, tipo: "ausente-no-novo", id }); continue; }
    if (!graficosIguais(ga, novo.graficos[id])) out.push({ cenario, tipo: "grafico", id, antigo: ga, novo: novo.graficos[id] });
  }
  for (const id of Object.keys(novo.textos)) if (!(id in antigo.textos) && id.startsWith("ch-")) out.push({ cenario, tipo: "sobra-no-novo", id });
  for (const id of Object.keys(novo.graficos)) if (!(id in antigo.graficos) && id.startsWith("ch-")) out.push({ cenario, tipo: "sobra-no-novo", id });
  return out;
}
