"use client";
import { useEffect, useRef, type JSX } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import { registrarGrafico, removerGrafico } from "@/client/registroGraficos";
import { useTema } from "@/client/tema";
import s from "./Grafico.module.css";

/** Monta a configuração do gráfico para o tema atual (escuro = prefers-color-scheme: dark). */
export type ConstruirGrafico = (escuro: boolean) => ChartConfiguration;

// Equivale ao mkChart do main.js: a cada configuração nova o gráfico é destruído e
// recriado. A configuração é montada AQUI, por `construir(escuro)`, a cada mudança de
// `construir` ou do tema — assim as cores de eixo/rótulo/grade (client/tema) nunca ficam
// presas ao tema de quando o chamador memorizou algo, e cada Chart recebe um objeto novo
// (o Chart.js altera a configuração que recebe). Quem chama deve memorizar `construir`
// (useCallback com os dados como dependência) para não recriar a cada render.
// O Chart.js (chart.js/auto, como o chart.umd.js do app antigo) é carregado sob demanda.
export function Grafico({ id, construir, altura }: { id: string; construir: ConstruirGrafico; altura?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const escuro = useTema();

  useEffect(() => {
    const config = construir(escuro);
    // window.__charts[id] = { data }, atualizado a cada configuração e removido ao desmontar.
    const reg = registrarGrafico(id, config.data);
    let vivo = true;
    let grafico: Chart | null = null;
    void import("chart.js/auto").then(({ default: ChartJs }) => {
      if (!vivo || !ref.current) return;
      grafico = new ChartJs(ref.current, config);
    });
    return () => { vivo = false; grafico?.destroy(); removerGrafico(id, reg); };
  }, [id, construir, escuro]);

  const canvas = <canvas id={id} ref={ref} />;
  return altura === undefined ? canvas : <div className={`${s.cw} cw`} style={{ height: altura }}>{canvas}</div>;
}
