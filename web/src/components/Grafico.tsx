"use client";
import { useEffect, useLayoutEffect, useRef, type JSX } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import { registrarGrafico, removerGrafico } from "@/client/registroGraficos";
import { useTema } from "@/client/tema";
import s from "./Grafico.module.css";

/** Monta a configuração do gráfico para o tema atual (escuro = prefers-color-scheme: dark). */
export type ConstruirGrafico = (escuro: boolean) => ChartConfiguration;

/**
 * Equivale ao mkChart do main.js: o gráfico é destruído e recriado quando os dados mudam.
 *
 * Padrão de uso:
 * ```tsx
 * const serie = useMemo(() => calcularSerie(fd), [fd]);
 * <Grafico id="ch-evolucao" chave={versaoDados} altura={210}
 *   construir={(escuro) => ({ type: "bar", data: { labels: serie.labels, datasets: [...] },
 *                             options: { scales: { x: { ticks: { color: axisClr() } } } } })} />
 * ```
 * - `construir` pode ser uma função inline: o componente guarda sempre a última, mas só a
 *   chama quando `chave`, `escuro` (tema) ou `id` mudam. Mudar `construir` sozinho não recria.
 * - `chave` é o que diz "os dados mudaram": um número/string derivado dos dados ou dos
 *   controles do gráfico (ex.: um contador incrementado num useMemo sobre `fd`, ou
 *   `${metrica}|${fd.length}|…`). Tudo o que muda o desenho precisa entrar na chave.
 * - As cores de eixo/rótulo/grade são lidas de client/tema dentro de `construir`, então a
 *   troca de tema sempre redesenha com as cores novas; cada Chart recebe um objeto novo
 *   (o Chart.js altera a configuração que recebe).
 * - window.__charts[id] = { data } acompanha cada reconstrução e sai ao desmontar.
 * O Chart.js (chart.js/auto, como o chart.umd.js do app antigo) é carregado sob demanda.
 */
export function Grafico({ id, chave, construir, altura }: {
  id: string; chave: string | number; construir: ConstruirGrafico; altura?: number;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const escuro = useTema();
  const construirAtual = useRef(construir);
  useLayoutEffect(() => { construirAtual.current = construir; });

  useEffect(() => {
    const config = construirAtual.current(escuro);
    const reg = registrarGrafico(id, config.data);
    let vivo = true;
    let grafico: Chart | null = null;
    void import("chart.js/auto").then(({ default: ChartJs }) => {
      if (!vivo || !ref.current) return;
      grafico = new ChartJs(ref.current, config);
    });
    return () => { vivo = false; grafico?.destroy(); removerGrafico(id, reg); };
  }, [id, chave, escuro]);

  const canvas = <canvas id={id} ref={ref} />;
  return altura === undefined ? canvas : <div className={`${s.cw} cw`} style={{ height: altura }}>{canvas}</div>;
}
