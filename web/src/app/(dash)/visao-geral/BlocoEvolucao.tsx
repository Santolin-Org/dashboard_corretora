"use client";
import { useMemo } from "react";
import { useEstadoAba } from "@/client/estadoAbas";
import type { Linha } from "@/domain/tipos";
import { evolucaoMensal, MESES_ROTULOS, type Metrica } from "@/domain/visao-geral";
import { fBRL, fShort } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { axisClr, gridClr } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import { ToggleMetrica } from "./ToggleMetrica";
import s from "./VisaoGeral.module.css";

const CLASSE = { "var-pos": s.varPos, "var-neg": s.varNeg, "var-neu": s.varNeu };

// renderEvolucao: linhas do ano corrente e do anterior (vigência) + barra de variação %.
export function BlocoEvolucao({ fd, hoje }: { fd: Linha[]; hoje: string }) {
  const [metrica, setMetrica] = useEstadoAba<Metrica>("visao-geral:mt-evol", "premio"); // mt-evol: Prêmio marcado de início
  const ev = useMemo(() => evolucaoMensal(fd, metrica, hoje), [fd, metrica, hoje]);
  return (
    <div className="chart-card span2">
      <div className="chart-top">
        <div className="chart-top-left">
          <span className="chart-title">Evolução mensal da produção</span>
          {" "}
          <div className="legend">
            <span><span className="leg-dot" style={{ background: "#639922" }} /><span id="leg-cur">{ev.anoAtual}</span></span>
            {" "}
            <span><span className="leg-dot" style={{ background: "#E24B4A" }} /><span id="leg-prev">{ev.anoAnterior}</span></span>
            {" "}
            <span style={{ fontSize: 10, opacity: 0.5 }}>· barra inferior = variação % vs. ano anterior</span>
          </div>
        </div>
        {" "}
        <ToggleMetrica nome="mt-evol" valor={metrica} aoMudar={setMetrica} />
      </div>
      {" "}
      <Grafico
        id="ch-evolucao" chave={idObjeto(ev)} altura={210}
        construir={() => {
          const ac = axisClr(), gc = gridClr();
          return {
            type: "line",
            data: {
              labels: MESES_ROTULOS,
              datasets: [
                { label: String(ev.anoAtual), data: ev.atual, borderColor: "#639922", backgroundColor: "rgba(99,153,34,0.08)", fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#639922", borderWidth: 2 },
                { label: String(ev.anoAnterior), data: ev.anterior, borderColor: "#E24B4A", backgroundColor: "rgba(226,75,74,0.06)", fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#E24B4A", borderWidth: 2, borderDash: [5, 3] },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ": " + fBRL(ctx.raw as number) } } },
              scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 }, callback: (v) => fShort(v as number) }, grid: { color: gc } } },
            },
          };
        }}
      />
      {" "}
      <div className={`${s.varBar} var-bar`} id="var-bar">
        {ev.variacoes.map((v, i) => <div key={i} className={`${s.varItem} ${CLASSE[v.cls]} var-item ${v.cls}`} title={v.titulo}>{v.txt}</div>)}
      </div>
    </div>
  );
}
