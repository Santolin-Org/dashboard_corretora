"use client";
import { useMemo } from "react";
import { graficoNivel, type ClienteCross } from "@/domain/crosssell";
import { fN, fP } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { axisClr, gridClr, labelClr, PALETA } from "@/client/tema";
import { idObjeto } from "@/client/versao";

// renderCrossNivel: .chart-card "Clientes por nível" com #cross-nivel-badge e o gráfico ch-cross-nivel.
export function BlocoNivel({ clientes }: { clientes: ClienteCross[] }) {
  const g = useMemo(() => graficoNivel(clientes), [clientes]);
  return (
    <div className="chart-card">
      <div className="chart-top">
        <span className="chart-title">Clientes por nível</span>
        {" "}
        <span className="chart-badge" id="cross-nivel-badge">{g.badge}</span>
      </div>
      {" "}
      <Grafico
        id="ch-cross-nivel" chave={idObjeto(g)} altura={240}
        construir={() => {
          const ac = axisClr(), lc = labelClr(), gc = gridClr();
          return {
            type: "bar",
            data: {
              labels: g.labels,
              datasets: [{ data: g.counts, backgroundColor: PALETA.slice(0, 4), borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.7 }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => fN(ctx.raw as number) + " clientes (" + fP(g.total ? (ctx.raw as number) / g.total : 0) + ")" } },
              },
              scales: {
                x: { ticks: { color: lc, font: { size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: ac, font: { size: 10 }, precision: 0 }, grid: { color: gc } },
              },
            },
          };
        }}
      />
    </div>
  );
}
