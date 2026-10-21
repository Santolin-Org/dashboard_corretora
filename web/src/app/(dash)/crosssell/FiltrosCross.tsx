"use client";
import { useMemo } from "react";
import { getCrossRamoUniverse, opcoesColabCross } from "@/domain/crosssell";
import { MultiSelect } from "@/components/MultiSelect";
import type { EstadoCross } from "./estado";
import s from "./Crosssell.module.css";

// Filtros próprios da aba (.ret-filter-card): tipo de pessoa, ramo (universo = ramos com apólice Ativa da pessoa)
// e colaborador (quem lançou algum documento da pessoa), mais "↻ Limpar" (resetCrossFilters).
export function FiltrosCross({ e }: { e: EstadoCross }) {
  const { todas, filtros } = e;
  const opcoesRam = useMemo(() => getCrossRamoUniverse(todas, filtros.pessoa), [todas, filtros.pessoa]);
  const opcoesCol = useMemo(() => opcoesColabCross(todas, filtros.pessoa), [todas, filtros.pessoa]);
  const grupo = `${s.fGroup} f-group`, rotulo = `${s.fLabel} f-label`;
  return (
    <div className={`${s.retFilterCard} ret-filter-card`}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".5px", width: "100%" }}>Filtros desta aba</div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Tipo de pessoa</span>
        {" "}
        <div className="view-toggle">
          <input type="radio" name="cross-pessoa" id="cp-pf" value="PF" checked={filtros.pessoa === "PF"} onChange={() => e.setPessoa("PF")} />
          {" "}
          <label htmlFor="cp-pf">Pessoa física (CPF)</label>
          {" "}
          <input type="radio" name="cross-pessoa" id="cp-pj" value="PJ" checked={filtros.pessoa === "PJ"} onChange={() => e.setPessoa("PJ")} />
          {" "}
          <label htmlFor="cp-pj">Pessoa jurídica (CNPJ)</label>
        </div>
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Ramo</span>
        {" "}
        {/* buildCrossFilters remonta o seletor ao trocar a pessoa (fecha o dropdown e limpa a busca do seletor). */}
        <MultiSelect key={`ram-${filtros.pessoa}`} id="ms-cross-ram" chave="ram" valores={opcoesRam} selecionados={filtros.ram} placeholder="Todos" onChange={e.setRam} />
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Colaborador</span>
        {" "}
        <MultiSelect key={`col-${filtros.pessoa}`} id="ms-cross-col" chave="col" valores={opcoesCol} selecionados={filtros.col} placeholder="Todos" onChange={e.setCol} />
      </div>
      {" "}
      <div className={grupo} style={{ marginLeft: "auto", justifyContent: "flex-end" }}>
        <button type="button" className="btn-sm" onClick={e.limpar}>↻ Limpar</button>
      </div>
    </div>
  );
}
