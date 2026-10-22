"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { kpisRetencao, type FiltrosRetencao, type PeriodoRet } from "@/domain/retencao";
import { Kpi } from "@/components/Kpi";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import s from "./Retencao.module.css";

// renderRetKPIs: #sc-ret-kpis com #ret-kpi-badge e #ret-kpi-grid (três blocos de cards).
export function BlocoKpis({ todas, f, p }: { todas: Linha[]; f: FiltrosRetencao; p: PeriodoRet }) {
  const k = useMemo(() => kpisRetencao(todas, f, p), [todas, f, p]);
  return (
    <SecaoRecolhivel chave="ret-kpis" cabecalho={<SecaoTitulo>Indicadores de churn{" "}<SecaoBadge id="ret-kpi-badge">{k.badge}</SecaoBadge></SecaoTitulo>}>
      <div style={{ padding: 16 }}>
        <div id="ret-kpi-grid">
          {k.blocos.map((bl) => (
            <div key={bl.titulo} className={`${s.kpiCompBlock} kpi-comp-block`}>
              <div className={`${s.kpiCompBlockTitle} kpi-comp-block-title`}>{bl.titulo}</div>
              <div className="kpi-grid">
                {bl.cartoes.map((c) => <Kpi key={c.rotulo} cor={c.cor} rotulo={c.rotulo} valor={c.valor} sub={c.sub} estiloValor={{ fontSize: c.fonte }} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
