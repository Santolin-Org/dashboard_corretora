"use client";
import { useState } from "react";
import type { FiltrosGlobais } from "@/domain/filtros";
import { chipsEscopo, tagsPeriodo, type DadosComp, type PeriodoComp } from "@/domain/comparativo";
import type { EstadoComp } from "./estado";
import s from "./Comparativo.module.css";

// .comp-filter-card (renderCompTab escreve o período calculado em #comp-start/#comp-end a cada render; digitar
// nos campos só vale ao clicar "Comparar"). O rascunho some a cada render da aba (filtro global, métrica, Comparar, Seguir).
export function FiltroPeriodo({ e, per, d, filtros, geracao }: { e: EstadoComp; per: PeriodoComp; d: DadosComp; filtros: FiltrosGlobais; geracao: number }) {
  const chave = [filtros, geracao, e.metrica, e.manual] as const;
  const [rasc, setRasc] = useState<{ s: string; e: string; chave: typeof chave } | null>(null);
  const valido = rasc && rasc.chave.every((x, i) => Object.is(x, chave[i])) ? rasc : null;
  const ini = valido ? valido.s : per.start, fim = valido ? valido.e : per.end;
  const tags = tagsPeriodo(per, d.prev);
  const manualAtivo = !!(e.manual && e.manual.start && e.manual.end);
  const chips = chipsEscopo(filtros, manualAtivo, per.seguindoGlobal);
  return (
    <div className={`${s.compFilterCard} comp-filter-card`}>
      <div className={`${s.fGroup} f-group`}>
        <span className={`${s.fLabel} f-label`}>Período atual — início de vigência</span>
        {" "}
        <div className={`${s.datePair} date-pair`}>
          <input type="date" id="comp-start" value={ini} onChange={(ev) => setRasc({ s: ev.target.value, e: fim, chave })} />
          <span className={`${s.dateSep} date-sep`}>→</span>
          <input type="date" id="comp-end" value={fim} onChange={(ev) => setRasc({ s: ini, e: ev.target.value, chave })} />
        </div>
      </div>
      {" "}
      <button type="button" className="btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => { if (ini && fim) e.setManual({ start: ini, end: fim }); }}>Comparar</button>
      {" "}
      <button type="button" className="btn-sm" id="comp-clear-period-btn" title="Voltar a usar o período do filtro de Vigência do topo"
        style={{ alignSelf: "flex-end", display: e.manual ? undefined : "none" }} onClick={() => e.setManual(null)}>↻ Seguir filtro global</button>
      {" "}
      <div className={`${s.periodLabels} comp-period-labels`}>
        <span className={`${s.periodTag} comp-period-tag`} id="comp-periodo-atual-tag">{tags.atual}</span>
        {" "}
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>vs.</span>
        {" "}
        <span className={`${s.periodTag} ${s.periodTagPrev} comp-period-tag`} id="comp-periodo-prev-tag">{tags.anterior}</span>
      </div>
      {" "}
      <div className={`${s.scopeChips} comp-scope-chips`} id="comp-scope-chips">
        {chips.chips.map((c, i) => <span key={i} className={chips.neutro ? `${s.scopeChip} ${s.scopeChipNeutral}` : s.scopeChip}>{c}</span>)}
      </div>
    </div>
  );
}
