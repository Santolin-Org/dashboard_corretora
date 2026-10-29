"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Linha } from "@/domain/tipos";
import type { FiltrosGlobais } from "@/domain/filtros";
import { dadosKpisComp, exportacaoKpisComp, kpisComp, type DadosComp } from "@/domain/comparativo";
import { baixarPlanilha } from "@/client/exportar";
import { exportarElementoPdf } from "@/client/exportarPdf";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import s from "./Comparativo.module.css";

const TENDENCIA: Record<string, string> = { "trend-up": s.trendUp, "trend-down": s.trendDown, "trend-neutral": s.trendNeutral };

// renderCompKPIs: #sc-comp-kpis com #comp-kpis-grid (4 blocos de 4 cartões). Os cartões vêm colados, com espaço
// só dentro de cada um (o template antigo tem quebras de linha dentro do cartão).
export function BlocoKpis({ todas, filtros, d, chips, renovacaoSoMeta, aoMudarRenovacaoSoMeta }: {
  todas: Linha[]; filtros: FiltrosGlobais; d: DadosComp; /** Chips do recorte (vão para a aba "Recorte" da planilha). */ chips: string[];
  renovacaoSoMeta: boolean; aoMudarRenovacaoSoMeta(v: boolean): void;
}) {
  const dados = useMemo(() => dadosKpisComp(todas, filtros, d), [todas, filtros, d]);
  const blocos = useMemo(() => kpisComp(d, dados, { soRamosMeta: renovacaoSoMeta }), [d, dados, renovacaoSoMeta]);
  const [modal, setModal] = useState(false);
  const grade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modal) return;
    const h = (ev: KeyboardEvent) => { if (ev.key === "Escape") setModal(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [modal]);

  const exportar = async (formato: "xlsx" | "pdf") => {
    setModal(false);
    if (formato === "xlsx") {
      const x = exportacaoKpisComp(blocos, d, chips, renovacaoSoMeta);
      await baixarPlanilha(x.arquivo, x.abas);
    } else if (grade.current) {
      await exportarElementoPdf(grade.current, `Comparativo_Indicadores_${d.start}_a_${d.end}.pdf`);
    }
  };
  return (
    <>
    <SecaoRecolhivel
      chave="comp-kpis"
      cabecalho={<SecaoTitulo>Indicadores complementares</SecaoTitulo>}
      controles={<button type="button" className="btn-sm" style={{ fontSize: 11 }} data-so-novo="" onClick={() => setModal(true)}>↑ Exportar</button>}
    >
      <div style={{ padding: 16 }}>
        {/* Só no app novo: a captura de paridade ignora este controle (data-so-novo). */}
        <label className={s.opcaoKpis} data-so-novo="">
          <input type="checkbox" id="comp-renov-so-meta" checked={renovacaoSoMeta} onChange={(ev) => aoMudarRenovacaoSoMeta(ev.target.checked)} />
          {" "}Renovação e churn só com ramos da meta (churn também só evitável, como na aba Retenção)
        </label>
        <div id="comp-kpis-grid" ref={grade}>
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
    {modal ? createPortal(
      <div className={`${s.modalOverlay} export-modal-overlay`} id="comp-kpis-export-modal" data-so-novo=""
        onClick={(ev) => { if (ev.target === ev.currentTarget) setModal(false); }}>
        <div className={s.modalCard} role="dialog" aria-label="Exportar indicadores">
          <div className={s.modalTitle}>Exportar indicadores</div>
          <button type="button" className={s.modalOption} onClick={() => void exportar("xlsx")}>📊 Excel (.xlsx)</button>
          <button type="button" className={s.modalOption} onClick={() => void exportar("pdf")}>📄 PDF</button>
          <button type="button" className={s.modalCancel} onClick={() => setModal(false)}>Cancelar</button>
        </div>
      </div>,
      document.body,
    ) : null}
    </>
  );
}
