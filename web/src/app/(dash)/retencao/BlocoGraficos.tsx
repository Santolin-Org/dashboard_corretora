"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { graficosRetencao, type FiltrosRetencao, type PeriodoRet } from "@/domain/retencao";
import { Grafico } from "@/components/Grafico";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { axisClr, gridClr, labelClr } from "@/client/tema";
import { idObjeto } from "@/client/versao";

// renderRetCharts: #sc-ret-charts com ch-ret-cancel (barras por motivo, altura dinâmica em #ret-cancel-wrap)
// e ch-ret-evolucao (linhas). Sem motivos o antigo destrói o gráfico e deixa o canvas vazio.
export function BlocoGraficos({ todas, f, p, hoje }: { todas: Linha[]; f: FiltrosRetencao; p: PeriodoRet; hoje: string }) {
  const g = useMemo(() => graficosRetencao(todas, f, p, hoje), [todas, f, p, hoje]);
  return (
    <SecaoRecolhivel chave="ret-charts" cabecalho={<SecaoTitulo>Análise de cancelamentos</SecaoTitulo>}>
      <div className="charts-grid" style={{ padding: 16 }}>
        <div className="chart-card">
          <div className="chart-top"><span className="chart-title">Cancelamentos por motivo</span><span className="chart-badge" id="ret-cancel-badge">{g.badgeCancel}</span></div>
          {" "}
          <div className="cw" id="ret-cancel-wrap" style={{ height: g.alturaCancel }}>
            {g.cancel ? (
              <Grafico
                id="ch-ret-cancel" chave={idObjeto(g)}
                construir={() => {
                  const ac = axisClr(), lc = labelClr(), gc = gridClr(), c = g.cancel!;
                  return {
                    type: "bar",
                    data: { labels: c.labels, datasets: [{ data: c.data, backgroundColor: c.cores, borderRadius: 4 }] },
                    options: {
                      indexAxis: "y", responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.raw + " apólices" } } },
                      scales: { x: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } },
                    },
                  };
                }}
              />
            ) : <canvas id="ch-ret-cancel" />}
          </div>
        </div>
        {" "}
        <div className="chart-card">
          <div className="chart-top">
            <div className="chart-top-left">
              <span className="chart-title">Evolução mensal — cancelamentos vs. vencimentos</span>
              {" "}
              <div className="legend">
                <span><span className="leg-dot" style={{ background: "#E24B4A" }} />Canceladas</span>
                {" "}
                <span><span className="leg-dot" style={{ background: "#BA7517" }} />Vencidas (não renovadas)</span>
              </div>
            </div>
          </div>
          {" "}
          <div className="cw" style={{ height: 240 }}>
            <Grafico
              id="ch-ret-evolucao" chave={idObjeto(g)}
              construir={() => {
                const ac = axisClr(), gc = gridClr(), e = g.evolucao;
                return {
                  type: "line",
                  data: {
                    labels: e.labels,
                    datasets: [
                      { label: "Canceladas", data: e.canceladas, borderColor: "#E24B4A", backgroundColor: "rgba(226,75,74,0.08)", fill: true, tension: 0.35, pointRadius: 4, borderWidth: 2 },
                      { label: "Vencidas", data: e.vencidas, borderColor: "#BA7517", backgroundColor: "rgba(186,117,23,0.06)", fill: true, tension: 0.35, pointRadius: 4, borderWidth: 2, borderDash: [5, 3] },
                    ],
                  },
                  options: {
                    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ": " + ctx.raw + " apólices" } } },
                    scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } } },
                  },
                };
              }}
            />
          </div>
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
