"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { kpisCross, type ClienteCross } from "@/domain/crosssell";
import { Kpi } from "@/components/Kpi";
import s from "./Crosssell.module.css";

// renderCrossKPIs: #cross-kpi-grid (7 cartões, sem espaço entre eles no template antigo).
export function BlocoKpis({ todas, clientes, ramos }: { todas: Linha[]; clientes: ClienteCross[]; ramos: string[] }) {
  const k = useMemo(() => kpisCross(todas, clientes, ramos), [todas, clientes, ramos]);
  return (
    <div className={`${s.gradeKpis} kpi-grid`} id="cross-kpi-grid">
      {k.map((c) => <Kpi key={c.l} cor={c.c} rotulo={c.l} valor={c.v} sub={c.s} texto={c.t} />)}
    </div>
  );
}
