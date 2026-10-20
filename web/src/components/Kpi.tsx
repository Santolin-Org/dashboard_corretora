import type { CSSProperties, ReactNode } from "react";
import s from "./Kpi.module.css";

export type CorKpi = "k-blue" | "k-green" | "k-red" | "k-amber" | "k-purple" | "k-teal";

// Card de KPI do app antigo: <div class="kpi k-blue"><div class="kpi-label">…</div>
// <div class="kpi-value">…</div><div class="kpi-sub">…</div></div>.
export function Kpi({ cor, rotulo, valor, sub, estiloValor }: {
  cor: CorKpi; rotulo: ReactNode; valor: ReactNode; sub?: ReactNode; estiloValor?: CSSProperties;
}) {
  return (
    <div className={`${s.kpi} kpi ${cor}`}>
      <div className={`${s.rotulo} kpi-label`}>{rotulo}</div>
      <div className={`${s.valor} kpi-value`} style={estiloValor}>{valor}</div>
      <div className={`${s.sub} kpi-sub`}>{sub}</div>
    </div>
  );
}
