"use client";
import { useEffect, useRef, type JSX } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import { registrarGrafico, removerGrafico } from "@/client/registroGraficos";
import { useTema } from "@/client/tema";
import s from "./Grafico.module.css";

// Equivale ao mkChart do main.js: a cada configuração nova o gráfico é destruído e
// recriado. Quem chama deve memorizar `config` (useMemo) para não recriar a cada render.
// O Chart.js (chart.js/auto, como o chart.umd.js do app antigo) é carregado sob demanda.
export function Grafico({ id, config, altura }: { id: string; config: ChartConfiguration; altura?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const escuro = useTema();

  // window.__charts[id] = { data }, atualizado a cada configuração e removido ao desmontar.
  useEffect(() => {
    const reg = registrarGrafico(id, config.data);
    return () => removerGrafico(id, reg);
  }, [id, config]);

  useEffect(() => {
    let vivo = true;
    let grafico: Chart | null = null;
    void import("chart.js/auto").then(({ default: ChartJs }) => {
      if (!vivo || !ref.current) return;
      grafico = new ChartJs(ref.current, config);
    });
    return () => { vivo = false; grafico?.destroy(); };
    // `escuro`: o tema mudou → recria (as cores vêm de client/tema na config do chamador).
  }, [config, escuro]);

  const canvas = <canvas id={id} ref={ref} />;
  return altura === undefined ? canvas : <div className={`${s.cw} cw`} style={{ height: altura }}>{canvas}</div>;
}
