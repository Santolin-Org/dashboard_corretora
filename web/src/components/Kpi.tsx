import type { CSSProperties, ReactNode } from "react";
import s from "./Kpi.module.css";

export type CorKpi = "k-blue" | "k-green" | "k-red" | "k-amber" | "k-purple" | "k-teal";

// Card de KPI do app antigo: <div class="kpi k-blue"><div class="kpi-label">…</div>
// <div class="kpi-value">…</div><div class="kpi-sub">…</div></div>.
// `texto`: o valor é um nome (ex.: ramo) — fonte menor, até 2 linhas, nome completo no tooltip.
export function Kpi({ cor, rotulo, valor, sub, estiloValor, texto }: {
  cor: CorKpi; rotulo: ReactNode; valor: ReactNode; sub?: ReactNode; estiloValor?: CSSProperties; texto?: boolean;
}) {
  const titulo = texto && typeof valor === "string" ? valor : undefined;
  return (
    <div className={`${s.kpi} kpi ${cor}`}>
      <div className={`${s.rotulo} kpi-label`}>{rotulo}</div>
      <div className={`${s.valor}${texto ? ` ${s.valorTexto} kpi-value-texto` : ""} kpi-value`} style={estiloValor} title={titulo}>{valor}</div>
      <div className={`${s.sub} kpi-sub`}>{sub}</div>
    </div>
  );
}
