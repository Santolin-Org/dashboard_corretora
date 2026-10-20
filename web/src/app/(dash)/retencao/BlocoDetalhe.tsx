"use client";
import { useMemo, useState } from "react";
import type { Linha } from "@/domain/tipos";
import {
  RET_DETAIL_PAGE_SIZE, exportacaoDetalhe, getRetDetailRows, tabelaDetalhe, type FiltroDetalhe, type FiltrosRetencao, type PeriodoRet,
} from "@/domain/retencao";
import { fN } from "@/domain/formatos";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { baixarPlanilha } from "@/client/exportar";
import s from "./Retencao.module.css";

const CLASSE_SIT: Record<string, string> = {
  "sit-badge-ativa": s.sitBadgeAtiva, "sit-badge-renovada": s.sitBadgeRenovada, "sit-badge-vencida": s.sitBadgeVencida,
  "sit-badge-cancelada": s.sitBadgeCancelada, "sit-badge-suspensa": s.sitBadgeSuspensa, "sit-badge-perda-total": s.sitBadgePerdaTotal,
};
const ATIVO = { borderColor: "#378ADD", fontWeight: 600 } as const; // toggleRetDetailFilter: destaca o botão do filtro atual
const BOTOES: { id: string; sit: FiltroDetalhe; rotulo: string }[] = [
  { id: "ret-filter-all-btn", sit: "", rotulo: "Todas" },
  { id: "ret-filter-canc-btn", sit: "Cancelada", rotulo: "Canceladas" },
  { id: "ret-filter-venc-btn", sit: "Vencida", rotulo: "Vencidas" },
];

// renderRetDetailTable: #sc-ret-detail com #ret-detail-badge, Exportar (exportData('detalhe')), filtro de situação,
// #ret-detail-wrap e #ret-detail-pagination. `retDetailPage` volta a 1 a cada renderRetTab (ação de filtro, período, visão, situação ou
// Limpar, ou voltar à aba): `geracao` é incrementada por essas ações, mesmo que o valor não mude.
export function BlocoDetalhe({ todas, f, p, situacao, aoMudarSituacao, geracao }: {
  todas: Linha[]; f: FiltrosRetencao; p: PeriodoRet; situacao: FiltroDetalhe; aoMudarSituacao(s: FiltroDetalhe): void; geracao: number;
}) {
  const [pg, setPg] = useState<{ geracao: number; n: number }>({ geracao, n: 1 });
  const pagina = pg.geracao === geracao ? pg.n : 1;
  const rows = useMemo(() => getRetDetailRows(todas, f, p, situacao), [todas, f, p, situacao]);
  const d = useMemo(() => tabelaDetalhe(rows, pagina), [rows, pagina]);
  const irPara = (n: number) => setPg({ geracao, n });
  const escolher = (sit: FiltroDetalhe) => aoMudarSituacao(sit); // a ação incrementa a geração: retDetailPage = 1
  const sp = " ";
  return (
    <SecaoRecolhivel
      chave="ret-detail"
      cabecalho={<SecaoTitulo>Detalhe apólice a apólice{" "}<SecaoBadge id="ret-detail-badge">{d.badge}</SecaoBadge></SecaoTitulo>}
      controles={
        <>
          <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px", marginRight: 8 }}
            onClick={() => void baixarPlanilha("Export_Detalhe.xlsx", [{ nome: "Detalhe", linhas: exportacaoDetalhe(rows) }])}>Exportar</button>
          {" "}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {BOTOES.map((b, i) => (
              <span key={b.id}>
                {i > 0 ? " " : null}
                <button type="button" className="btn-sm" id={b.id} onClick={() => escolher(b.sit)} style={{ fontSize: 11, ...(situacao === b.sit ? ATIVO : {}) }}>{b.rotulo}</button>
              </span>
            ))}
          </div>
        </>
      }
    >
      <div className={`${s.detailTableWrap} detail-table-wrap`} id="ret-detail-wrap">
        {d.total ? (
          <table className="ret-table detail-table">
            <thead>
              <tr>
                <th>Tipo{sp}</th>
                <th style={{ minWidth: 150 }}>Cliente{sp}</th>
                <th>Ramo{sp}</th>
                <th>Seguradora{sp}</th>
                <th>Colaborador{sp}</th>
                <th>Situação{sp}</th>
                <th>Motivo{sp}</th>
                <th style={{ textAlign: "right" }}>Prêmio{sp}</th>
                <th style={{ textAlign: "right" }}>Comissão{sp}</th>
                <th>Vigência{sp}</th>
                <th title="Data de cancelamento, para canceladas; término de vigência, para vencidas">Saída{sp}</th>
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((r, i) => (
                <tr key={i}>
                  <td><span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#f0fdf4", color: "#16a34a" }}>{r.tipo}</span>{sp}</td>
                  <td className="name-cell" style={{ maxWidth: 180 }} title={r.cli}>{r.cli}{sp}</td>
                  <td>{r.ramo}{sp}</td>
                  <td>{r.seg}{sp}</td>
                  <td>{r.colab}{sp}</td>
                  <td>
                    {r.classeSit
                      ? <span className={`${s.sitBadge} ${CLASSE_SIT[r.classeSit]} sit-badge ${r.classeSit}`}>{r.sit}</span>
                      : <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.sit}</span>}
                    {sp}
                  </td>
                  <td>{r.motivo}{sp}</td>
                  <td className="num">{r.premio}{sp}</td>
                  <td className="num">{r.com}{sp}</td>
                  <td>{r.vig}{sp}</td>
                  <td>{r.saida}{sp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>Nenhuma apólice perdida no período com os filtros atuais.</div>}
      </div>
      {" "}
      <div id="ret-detail-pagination" style={{ display: d.total > RET_DETAIL_PAGE_SIZE ? "flex" : "none", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderTop: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fN(d.inicio + 1)}–{fN(d.inicio + d.naPagina)} de {fN(d.total)}</span>
        {" "}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" className="btn-sm" style={{ fontSize: 11, padding: "3px 9px" }} disabled={d.pagina <= 1} onClick={() => irPara(d.pagina - 1)}>← Anterior</button>
          {" "}
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Página {d.pagina} de {d.totalPaginas}</span>
          {" "}
          <button type="button" className="btn-sm" style={{ fontSize: 11, padding: "3px 9px" }} disabled={d.pagina >= d.totalPaginas} onClick={() => irPara(d.pagina + 1)}>Próxima →</button>
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
