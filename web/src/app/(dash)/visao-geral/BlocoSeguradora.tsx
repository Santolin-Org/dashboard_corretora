"use client";
import { useMemo, useState } from "react";
import type { Linha } from "@/domain/tipos";
import { concentracaoSeguradora, type Metrica } from "@/domain/visao-geral";
import { fBRL, fP } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { borderClr, PALETA } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import { ToggleMetrica } from "./ToggleMetrica";

// renderSeguradora: rosca com top 8 + Outros e legenda de participação.
export function BlocoSeguradora({ fd }: { fd: Linha[] }) {
  const [metrica, setMetrica] = useState<Metrica>("premio"); // mt-seg
  const sg = useMemo(() => concentracaoSeguradora(fd, metrica), [fd, metrica]);
  const cores = PALETA.slice(0, sg.rotulos.length);
  return (
    <div className="chart-card">
      <div className="chart-top">
        <span className="chart-title">Concentração por seguradora</span>
        {" "}
        <ToggleMetrica nome="mt-seg" valor={metrica} aoMudar={setMetrica} />
      </div>
      {" "}
      <div className="legend" id="seg-legend">
        {sg.legenda.map((l, i) => (
          <span key={i}><span className="leg-dot" style={{ background: cores[i] }} />{l.rotulo} {l.pct}</span>
        ))}
      </div>
      {" "}
      <Grafico
        id="ch-seg" chave={idObjeto(sg)} altura={200}
        construir={() => ({
          type: "doughnut",
          data: { labels: sg.rotulos, datasets: [{ data: sg.valores, backgroundColor: cores, borderWidth: 2, borderColor: borderClr() }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: "58%",
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.label + ": " + fBRL(ctx.raw as number) + " (" + fP(sg.total ? (ctx.raw as number) / sg.total : 0) + ")" } } },
          },
        })}
      />
    </div>
  );
}
