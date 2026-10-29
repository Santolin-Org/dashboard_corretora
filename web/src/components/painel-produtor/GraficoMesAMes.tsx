"use client";
import { useMemo } from "react";
import type { ChartConfiguration, Plugin } from "chart.js";
import { usePainel } from "@/client/painel";
import { axisClr } from "@/client/tema";
import { fCurto, mesAMes } from "@/domain/painel-produtor";
import { fBRL } from "@/domain/formatos";
import { Grafico } from "../Grafico";
import s from "./PainelProdutor.module.css";

const ROTULOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const COR_P = "#4E80FF", COR_C = "#2DD4A0";

// Valor curto (48k, 7,9k) em cima de cada barra, na cor da série (`cores[i]` = dataset i).
const rotulosTopo = (cores: string[]): Plugin<"bar"> => ({
  id: "ppRotulosTopo",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 9px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      ctx.fillStyle = cores[i] ?? axisClr();
      meta.data.forEach((el, j) => {
        const v = ds.data[j] as number | null;
        if (v === null || v === undefined || v === 0) return;
        const { x, y } = el.getProps(["x", "y"], true) as { x: number; y: number };
        ctx.fillText(fCurto(v), x, y - 3);
      });
    });
    ctx.restore();
  },
});

/** 4.3 — 12 meses do ano de hoje: prêmio e comissão lado a lado, cada um na sua escala. */
export function GraficoMesAMes({ nomes, prefixoTitulo = "Minha produção" }: { nomes: ReadonlySet<string>; prefixoTitulo?: string }) {
  const { base } = usePainel();
  const ano = +base.hoje.slice(0, 4), mesAtual = +base.hoje.slice(5, 7);
  const serie = useMemo(() => mesAMes(base.linhas, nomes, ano), [base, nomes, ano]);
  // Meses futuros ficam sem barra (null); o mês atual vai em cor cheia, os anteriores um pouco apagados.
  const corta = (v: number[]) => v.map((x, i) => (i + 1 > mesAtual ? null : x));
  const tons = (c: string) => ROTULOS.map((_, i) => (i + 1 === mesAtual ? c : `${c}bf`));
  const premio = corta(serie.premio), com = corta(serie.com);
  const vazio = premio.every((v) => !v) && com.every((v) => !v);

  return (
    <section className={`${s.card} ${s.largo}`} aria-labelledby="pp-mes-titulo">
      <h2 id="pp-mes-titulo">{prefixoTitulo} em {ano}, mês a mês</h2>
      <div className={s.legenda} style={{ marginTop: 0, marginBottom: 8 }}>
        <span style={{ ["--c" as string]: COR_P }}>Prêmio líquido</span>
        <span style={{ ["--c" as string]: COR_C }}>Comissão</span>
      </div>
      {vazio ? <p className={s.vazio}>Nenhuma produção em {ano}.</p> : (
        <Grafico id="pp-mes" altura={160} chave={JSON.stringify([premio, com, mesAtual])}
          construir={(escuro): ChartConfiguration => ({
            type: "bar",
            data: {
              labels: ROTULOS,
              datasets: [
                { label: "Prêmio líquido", data: premio, yAxisID: "y", backgroundColor: tons(COR_P), borderRadius: 3 },
                { label: "Comissão", data: com, yAxisID: "y1", backgroundColor: tons(COR_C), borderRadius: 3 },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false, animation: false,
              layout: { padding: { top: 16 } },
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fBRL(c.parsed.y ?? 0)}` } } },
              scales: {
                x: { grid: { display: false }, ticks: { color: axisClr(), font: (c) => ({ size: 10, weight: c.index === mesAtual - 1 ? "bold" : "normal" }) } },
                y: { display: false, beginAtZero: true },
                y1: { display: false, beginAtZero: true, grid: { display: false } },
              },
            },
            plugins: [rotulosTopo(escuro ? ["#9cb8ff", COR_C] : ["#2f5fd6", "#14946d"]) as Plugin],
          })} />
      )}
    </section>
  );
}
