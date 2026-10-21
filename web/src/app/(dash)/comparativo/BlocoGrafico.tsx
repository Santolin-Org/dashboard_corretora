"use client";
import { Fragment, useMemo } from "react";
import { Grafico } from "@/components/Grafico";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { axisClr, gridClr } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import { fBRL, fN, fShort } from "@/domain/formatos";
import { METRICAS_COMP, graficoComp, type DadosComp, type MetricaComp } from "@/domain/comparativo";
import s from "./Comparativo.module.css";

// renderCompChart: #sc-comp-chart com ch-comp-main (barras atual/anterior + linha de variação %).
export function BlocoGrafico({ d, metrica, aoMudar }: { d: DadosComp; metrica: MetricaComp; aoMudar(m: MetricaComp): void }) {
  const g = useMemo(() => graficoComp(d, metrica), [d, metrica]);
  return (
    <SecaoRecolhivel
      chave="comp-chart"
      cabecalho={
        <div>
          <SecaoTitulo>Evolução mensal comparativa</SecaoTitulo>
          {" "}
          <div className="legend" style={{ marginTop: 5 }}>
            <span><span className="leg-dot" style={{ background: "#4E80FF" }} />Período atual</span>
            {" "}
            <span><span className="leg-dot" style={{ background: "#7888A8" }} />Período anterior</span>
            {" "}
            <span><span className="leg-dot" style={{ background: "#F5A623" }} />Variação %</span>
          </div>
        </div>
      }
      controles={
        <div className={`${s.metricToggle} comp-metric-toggle`}>
          {METRICAS_COMP.map((m) => (
            <Fragment key={m.id}>
              <input type="radio" name="comp-metric" id={m.id} value={m.valor} checked={metrica === m.valor} onChange={() => aoMudar(m.valor)} />
              {" "}
              <label htmlFor={m.id}>{m.rotulo}</label>
              {" "}
            </Fragment>
          ))}
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        <div className="cw" style={{ height: 300 }}>
          <Grafico
            id="ch-comp-main" chave={idObjeto(g)}
            construir={() => {
              const ac = axisClr(), gc = gridClr();
              return {
                type: "bar",
                data: {
                  labels: g.labels,
                  datasets: [
                    { type: "bar", label: `Atual — ${g.rotulo}`, data: g.valA, backgroundColor: "rgba(78,128,255,0.72)", borderRadius: 4, yAxisID: "y" },
                    { type: "bar", label: `Anterior — ${g.rotulo}`, data: g.valP, backgroundColor: "rgba(120,136,168,0.38)", borderRadius: 4, yAxisID: "y" },
                    { type: "line", label: "Variação %", data: g.varPct, borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.08)", borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#F5A623", tension: 0.35, yAxisID: "y1" },
                  ],
                },
                options: {
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ctx.datasetIndex === 2
                          ? `Variação: ${(ctx.raw as number).toFixed(1)}%`
                          : ctx.dataset.label + ": " + (g.isMoney ? fBRL(ctx.raw as number) : fN(ctx.raw as number)),
                      },
                    },
                  },
                  scales: {
                    x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } },
                    y: { position: "left", ticks: { color: ac, font: { size: 10 }, callback: g.isMoney ? (v) => fShort(Number(v)) : (v) => fN(Number(v)) }, grid: { color: gc } },
                    y1: { position: "right", ticks: { color: "#F5A623", font: { size: 10 }, callback: (v) => Number(v).toFixed(0) + "%" }, grid: { display: false } },
                  },
                },
              };
            }}
          />
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
