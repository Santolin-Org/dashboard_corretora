"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { penetracaoCross, type ClienteCross, type ModoPen } from "@/domain/crosssell";
import s from "./Crosssell.module.css";

// renderCrossPenetracao: .chart-card com #cross-pen-title, rádios cross-pen-mode e #cross-pen-wrap (barras HTML).
export function BlocoPenetracao({ todas, clientes, ramos, modo, aoMudarModo }: {
  todas: Linha[]; clientes: ClienteCross[]; ramos: string[]; modo: ModoPen; aoMudarModo(m: ModoPen): void;
}) {
  const p = useMemo(() => penetracaoCross(todas, clientes, ramos, modo), [todas, clientes, ramos, modo]);
  return (
    <div className="chart-card">
      <div className="chart-top">
        <span className="chart-title" id="cross-pen-title">{p.titulo}</span>
        {" "}
        <div className="view-toggle">
          <input type="radio" name="cross-pen-mode" id="cpm-pen" value="penetracao" checked={modo === "penetracao"} onChange={() => aoMudarModo("penetracao")} />
          {" "}
          <label htmlFor="cpm-pen">Penetração</label>
          {" "}
          <input type="radio" name="cross-pen-mode" id="cpm-opp" value="oportunidade" checked={modo === "oportunidade"} onChange={() => aoMudarModo("oportunidade")} />
          {" "}
          <label htmlFor="cpm-opp">Oportunidade</label>
        </div>
      </div>
      {" "}
      <div className={`${s.penWrap} pen-wrap`} id="cross-pen-wrap">
        {p.vazio ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Nenhum dado para o filtro atual.</div>
        ) : p.linhas.map((l) => (
          <div key={l.ramo} className={`${s.penRow} pen-row`}>
            <div className={`${s.penLabel} pen-label`} title={l.ramo}>{l.ramo}</div>
            {" "}
            {l.modo === "oportunidade" ? (
              <div className={`${s.penBar} pen-bar`}>
                <div className={`${s.penSegOpp} pen-seg-opp`} style={{ width: `${l.largura}%` }}><span>{l.txt}</span></div>
              </div>
            ) : (
              <div className={`${s.penBar} pen-bar`}>
                <div className={`${s.penSegYes} pen-seg-yes`} style={{ width: `${l.larguraYes}%` }}><span>{l.txtYes}</span></div>
                {" "}
                <div className={`${s.penSegNo} pen-seg-no`}><span>{l.txtNo}</span></div>
              </div>
            )}
            {" "}
          </div>
        ))}
      </div>
    </div>
  );
}
