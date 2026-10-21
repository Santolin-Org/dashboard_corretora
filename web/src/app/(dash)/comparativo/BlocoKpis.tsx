"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import type { FiltrosGlobais } from "@/domain/filtros";
import { dadosKpisComp, kpisComp, type DadosComp } from "@/domain/comparativo";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import s from "./Comparativo.module.css";

const TENDENCIA: Record<string, string> = { "trend-up": s.trendUp, "trend-down": s.trendDown, "trend-neutral": s.trendNeutral };

// renderCompKPIs: #sc-comp-kpis com #comp-kpis-grid (4 blocos de 4 cartões). Os cartões vêm colados, com espaço
// só dentro de cada um (o template antigo tem quebras de linha dentro do cartão).
export function BlocoKpis({ todas, filtros, d }: { todas: Linha[]; filtros: FiltrosGlobais; d: DadosComp }) {
  const blocos = useMemo(() => kpisComp(d, dadosKpisComp(todas, filtros, d)), [todas, filtros, d]);
  return (
    <SecaoRecolhivel chave="comp-kpis" cabecalho={<SecaoTitulo>Indicadores complementares</SecaoTitulo>}>
      <div style={{ padding: 16 }}>
        <div id="comp-kpis-grid">
          {blocos.map((b) => (
            <div key={b.titulo} className={`${s.kpiBlock} kpi-comp-block`}>
              <div className={`${s.kpiBlockTitle} kpi-comp-block-title`}>{b.titulo}</div>
              {" "}
              <div className={`${s.kpiGrid} kpi-comp-grid`}>
                {b.cartoes.map((c) => (
                  <div key={c.rotulo} className={`${s.kpiCard} kpi-comp-card`} title={c.titulo || undefined}>
                    {" "}
                    <div className={`${s.kpiTop} kpi-comp-top`}>
                      {" "}
                      <span className={`${s.kpiLabel} kpi-comp-label`}>{c.rotulo}</span>
                      {" "}
                      <span className={`${s.kpiTrend} ${TENDENCIA[c.trendCls]} kpi-comp-trend ${c.trendCls}`}>{c.trendTxt}</span>
                      {" "}
                    </div>
                    {" "}
                    <div className={`${s.kpiValue} kpi-comp-value`}>{c.valor}</div>
                    {" "}
                    <div className={`${s.kpiFoot} kpi-comp-foot`}>{c.foot}</div>
                    {" "}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
