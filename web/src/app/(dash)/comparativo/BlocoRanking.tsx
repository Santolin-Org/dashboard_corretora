"use client";
import { Fragment, useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { fBRL } from "@/domain/formatos";
import { compRankDeltaBadge, getCompRankData, tabelaRank, type DimRank, type MetricaRank } from "@/domain/comparativo";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import s from "./Comparativo.module.css";

const TENDENCIA: Record<string, string> = { "trend-up": s.trendUp, "trend-down": s.trendDown, "trend-neutral": s.trendNeutral };
const Badge = ({ a, p }: { a: number; p: number }) => {
  const b = compRankDeltaBadge(a, p);
  return <span className={`${s.kpiTrend} ${TENDENCIA[b.cls]} kpi-comp-trend ${b.cls}`}>{b.txt}</span>;
};
const Toggle = <T extends string>({ nome, prefixo, opcoes, valor, aoMudar }: { nome: string; prefixo: string; opcoes: [T, string, string][]; valor: T; aoMudar(v: T): void }) => (
  <div className="metric-toggle">
    {opcoes.map(([v, sufixo, rotulo]) => (
      <Fragment key={v}>
        <input type="radio" name={nome} id={`${prefixo}-${sufixo}`} value={v} checked={valor === v} onChange={() => aoMudar(v)} />
        {" "}
        <label htmlFor={`${prefixo}-${sufixo}`}>{rotulo}</label>
        {" "}
      </Fragment>
    ))}
  </div>
);

// renderCompRankTable: #sc-comp-rank "Maiores variações" (25 maiores movimentos em módulo, ordenados por Δ).
export function BlocoRanking({ atual, anterior, dim, metrica, aoMudarDim, aoMudarMetrica }: {
  atual: Linha[]; anterior: Linha[]; dim: DimRank; metrica: MetricaRank; aoMudarDim(d: DimRank): void; aoMudarMetrica(m: MetricaRank): void;
}) {
  const rows = useMemo(() => getCompRankData(atual, anterior, dim, metrica), [atual, anterior, dim, metrica]);
  const t = useMemo(() => tabelaRank(rows, dim), [rows, dim]);
  return (
    <SecaoRecolhivel
      chave="comp-rank"
      cabecalho={<SecaoTitulo>Maiores variações</SecaoTitulo>}
      controles={
        <>
          <Toggle<DimRank> nome="comp-rank-dim" prefixo="crd" valor={dim} aoMudar={aoMudarDim} opcoes={[["colab", "colab", "Produtor"], ["seg", "seg", "Seguradora"], ["ramo", "ramo", "Ramo"]]} />
          {" "}
          <Toggle<MetricaRank> nome="comp-rank-metric" prefixo="crm" valor={metrica} aoMudar={aoMudarMetrica} opcoes={[["premio", "premio", "Prêmio"], ["com", "com", "Comissão"]]} />
        </>
      }
    >
      <div className="ret-table-wrap" id="comp-rank-wrap">
        {!rows.length ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Nenhum dado para o filtro atual.</div>
        ) : (
          <table className="ret-table" id="comp-rank-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{t.rotuloDim}{" "}</th>
                <th className="num">Novo atual</th><th className="num">Novo anterior</th><th className="num">Δ% novo{" "}</th>
                <th className="num">Renov. atual</th><th className="num">Renov. anterior</th><th className="num">Δ% renov.{" "}</th>
                <th className="num">Total atual</th><th className="num">Total anterior</th><th className="num">Δ% total{" "}</th>
              </tr>
            </thead>
            <tbody>
              {t.linhas.map((r) => (
                <tr key={r.key}>
                  <td className="name-cell">{r.key}{" "}</td>
                  <td className="num">{fBRL(r.a.novo)}</td><td className="num">{fBRL(r.p.novo)}</td><td className="num"><Badge a={r.a.novo} p={r.p.novo} />{" "}</td>
                  <td className="num">{fBRL(r.a.renov)}</td><td className="num">{fBRL(r.p.renov)}</td><td className="num"><Badge a={r.a.renov} p={r.p.renov} />{" "}</td>
                  <td className="num">{fBRL(r.a.total)}</td><td className="num">{fBRL(r.p.total)}</td><td className="num"><Badge a={r.a.total} p={r.p.total} />{" "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {" "}
      <div id="comp-rank-counter" style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>{t.contador}</div>
    </SecaoRecolhivel>
  );
}
