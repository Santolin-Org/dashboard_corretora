"use client";
import { useMemo, useState } from "react";
import type { Linha } from "@/domain/tipos";
import { producaoPorRamo, type Metrica } from "@/domain/visao-geral";
import { fBRL, fShort } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { axisClr, gridClr, labelClr, PALETA } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import { ToggleMetrica } from "./ToggleMetrica";

// renderRamo: top 8 ramos, barras horizontais.
export function BlocoRamo({ fd }: { fd: Linha[] }) {
  const [metrica, setMetrica] = useState<Metrica>("premio"); // mt-ramo
  const rm = useMemo(() => producaoPorRamo(fd, metrica), [fd, metrica]);
  return (
    <div className="chart-card">
      <div className="chart-top">
        <span className="chart-title">Produção por ramo</span>
        {" "}
        <ToggleMetrica nome="mt-ramo" valor={metrica} aoMudar={setMetrica} />
      </div>
      {" "}
      <Grafico
        id="ch-ramo" chave={idObjeto(rm)} altura={200}
        construir={() => {
          const ac = axisClr(), lc = labelClr(), gc = gridClr();
          return {
            type: "bar",
            data: { labels: rm.rotulos, datasets: [{ data: rm.valores, backgroundColor: PALETA.slice(0, rm.valores.length), borderRadius: 4 }] },
            options: {
              indexAxis: "y", responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fBRL(ctx.raw as number) } } },
              scales: { x: { ticks: { color: ac, font: { size: 10 }, callback: (v) => fShort(v as number) }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } },
            },
          };
        }}
      />
    </div>
  );
}
