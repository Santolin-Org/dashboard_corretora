"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Linha } from "@/domain/tipos";
import { fBRL, fP } from "@/domain/formatos";
import {
  buildCompPivotRows, campoPivo, exportacaoPivo, getCompPivotData, rotuloColunaPivo, type MetricaPivo, type VisaoPivo,
} from "@/domain/comparativo";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { baixarPlanilha } from "@/client/exportar";
import { exportarElementoPdf } from "@/client/exportarPdf";
import type { EstadoComp } from "./estado";
import s from "./Comparativo.module.css";

const BORDA = { borderLeft: "1px solid var(--border-subtle)" } as const;

// renderCompPivotTable: #sc-comp-pivot (seguradora/ramo por ano civil sobre FD) + modal de exportação.
// O nome vai no estado (e não no atributo) como no antigo, que usa data-seg por causa das aspas da planilha.
export function BlocoPivo({ fd, e }: { fd: Linha[]; e: EstadoComp }) {
  const { visao, metricaPivo, recolhidas } = e;
  const rec = useMemo(() => new Set(recolhidas), [recolhidas]);
  const dados = useMemo(() => getCompPivotData(fd, campoPivo(metricaPivo)), [fd, metricaPivo]);
  const { years, seguradoras, totalGeral } = dados;
  const linhas = useMemo(() => buildCompPivotRows(seguradoras, visao, rec), [seguradoras, visao, rec]);
  const [modal, setModal] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modal) return;
    const h = (ev: KeyboardEvent) => { if (ev.key === "Escape") setModal(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [modal]);

  const alternar = (nome: string) => e.setRecolhidas(rec.has(nome) ? recolhidas.filter((n) => n !== nome) : [...recolhidas, nome]);
  const celulas = (v: Map<number, number>) => years.map((y) => {
    const x = v.get(y) || 0, t = totalGeral.get(y) || 0;
    return <Fragment key={y}><td className="num" style={BORDA}>{fBRL(x)}</td><td className="num">{fP(t > 0 ? x / t : 0)}</td></Fragment>;
  });
  const vazio = !years.length || !seguradoras.length;

  const exportar = async (formato: "xlsx" | "pdf") => {
    setModal(false);
    if (vazio) { alert("Não há dados para exportar com o filtro atual."); return; }
    if (formato === "xlsx") {
      const x = exportacaoPivo(dados, visao, rec);
      await baixarPlanilha(x.arquivo, [{ nome: "Comparativo", linhas: x.linhas, cabecalho: x.cabecalho }]);
    } else if (wrap.current) {
      await exportarElementoPdf(wrap.current, "Comparativo_Seguradora_Ramo.pdf");
    }
  };

  const radio = (v: VisaoPivo, sufixo: string, rotulo: string) => (
    <>
      <input type="radio" name="vw-comp-pivot" id={`vw-comp-pivot-${sufixo}`} value={v} checked={visao === v} onChange={() => e.setVisao(v)} />
      {" "}
      <label htmlFor={`vw-comp-pivot-${sufixo}`}>{rotulo}</label>
      {" "}
    </>
  );
  const radioM = (v: MetricaPivo, sufixo: string, rotulo: string) => (
    <>
      <input type="radio" name="mt-comp-pivot" id={`mt-comp-pivot-${sufixo}`} value={v} checked={metricaPivo === v} onChange={() => e.setMetricaPivo(v)} />
      {" "}
      <label htmlFor={`mt-comp-pivot-${sufixo}`}>{rotulo}</label>
      {" "}
    </>
  );

  return (
    <>
      <SecaoRecolhivel
        chave="comp-pivot"
        cabecalho={<SecaoTitulo>Comparativo por seguradora e ramo</SecaoTitulo>}
        controles={
          <>
            <div className="metric-toggle">{radio("seg", "s", "Seguradora")}{radio("ramo", "r", "Ramo")}{radio("ambos", "a", "Seguradora + ramo")}</div>
            {" "}
            <div className={s.pivotBulk} id="comp-pivot-bulk" style={visao === "ambos" ? undefined : { display: "none" }}>
              <button type="button" className="btn-sm" style={{ fontSize: 11 }} title="Recolher os ramos de todas as seguradoras" onClick={() => e.setRecolhidas(seguradoras.map((x) => x.nome))}>− Recolher</button>
              {" "}
              <button type="button" className="btn-sm" style={{ fontSize: 11 }} title="Expandir os ramos de todas as seguradoras" onClick={() => e.setRecolhidas([])}>+ Expandir</button>
            </div>
            {" "}
            <div className="metric-toggle">{radioM("premio", "p", "Prêmio líquido")}{radioM("comissao", "c", "Comissão")}</div>
            {" "}
            <button type="button" className="btn-sm" style={{ fontSize: 11 }} onClick={() => setModal(true)}>↑ Exportar</button>
          </>
        }
      >
        <div className="ret-table-wrap" id="comp-pivot-wrap" ref={wrap}>
          {vazio ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Nenhum dado para o filtro atual.</div>
          ) : (
            <table className="ret-table" id="comp-pivot-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: "left", verticalAlign: "bottom" }}>{rotuloColunaPivo(visao)}{" "}</th>
                  {years.map((y, i) => <th key={y} colSpan={2} style={{ textAlign: "center", ...BORDA }}>{y}{i === years.length - 1 ? " " : null}</th>)}
                </tr>
                <tr>
                  {years.map((y, i) => <Fragment key={y}><th className="num" style={BORDA}>Valor</th><th className="num">%{i === years.length - 1 ? " " : null}</th></Fragment>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r, i) => r.level === 1 ? (
                  <tr key={i} className={`${s.pivotSub} comp-pivot-sub`}><td>{r.nome}</td>{celulas(r.valores)}</tr>
                ) : (
                  <tr key={i} className={`${s.pivotTotal} comp-pivot-total`}>
                    <td className={r.collapsible ? `${s.pivotToggle} comp-pivot-toggle` : undefined} title={r.collapsible ? "Recolher/expandir ramos" : undefined}
                      onClick={r.collapsible ? () => alternar(r.nome) : undefined}>
                      {r.collapsible ? <span className={`${s.pivotChevron} comp-pivot-chevron`}>{r.collapsed ? "▸" : "▾"}</span> : null}{r.nome}
                    </td>
                    {celulas(r.valores)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total geral</td>{celulas(totalGeral)}</tr></tfoot>
            </table>
          )}
        </div>
      </SecaoRecolhivel>
      {modal ? createPortal(
        <div className={`${s.modalOverlay} export-modal-overlay`} id="comp-pivot-export-modal" onClick={(ev) => { if (ev.target === ev.currentTarget) setModal(false); }}>
          <div className={s.modalCard}>
            <div className={s.modalTitle}>Exportar tabela</div>
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
