"use client";
import { useEffect, useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { exportacaoCross, getCrossClients, tabelaCross, type ChaveOrdemCross, type ClienteCross } from "@/domain/crosssell";
import { fN } from "@/domain/formatos";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { baixarPlanilha } from "@/client/exportar";
import { agoraMs } from "@/client/agora";
import type { EstadoCross } from "./estado";

const BTN = { fontSize: 11, padding: "3px 9px" } as const;

// renderCrossTable + renderCrossPagination: #sc-cross-table com #cross-table-badge, busca (#cross-search), Exportar,
// #cross-table-wrap e #cross-table-pagination. Ordenação inicial: LTV desc (crossSortKey/crossSortDir do topo do main.js).
// O espaço depois de cada célula reproduz a quebra de linha entre <td>/<th> do template antigo (as células de ramo
// vêm coladas, sem espaço entre elas).
export function BlocoTabela({ todas, clientes, ramos, e }: { todas: Linha[]; clientes: ClienteCross[]; ramos: string[]; e: EstadoCross }) {
  const { ordem, pagina, filtros } = e;
  const t = useMemo(() => tabelaCross(clientes, ramos, ordem, pagina), [clientes, ramos, ordem, pagina]);
  // renderCrossTable grava a página limitada em crossPage (ex.: a base nova tem menos páginas).
  const { limitarPagina } = e;
  useEffect(() => { limitarPagina(t.pagina); }, [t.pagina, limitarPagina]);
  const sp = " ";
  const classe = (k: ChaveOrdemCross) => (k === ordem.chave ? (ordem.dir === "asc" ? "sort-asc" : "sort-desc") : "");
  const th = (k: ChaveOrdemCross, rotulo: string, alinhar: "left" | "right" = "left") => (
    <th className={`ret-sortable ${classe(k)}`} style={{ textAlign: alinhar }} onClick={() => e.ordenar(k)}>{rotulo}<span className="sort-icon" />{sp}</th>
  );
  const ultimo = ramos.length - 1;
  return (
    <SecaoRecolhivel
      chave="cross-table"
      cabecalho={<SecaoTitulo>Clientes{" "}<SecaoBadge id="cross-table-badge">{t.badge}</SecaoBadge></SecaoTitulo>}
      controles={
        <>
          <input
            type="text" id="cross-search" placeholder="Buscar por nome ou CPF/CNPJ..." value={filtros.busca} onChange={(ev) => e.setBusca(ev.target.value)}
            style={{ padding: "5px 10px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", fontSize: 11, minWidth: 220 }}
          />
          {" "}
          <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px" }}
            onClick={() => void baixarPlanilha("Export_CrossSell.xlsx", [{ nome: "CrossSell", linhas: exportacaoCross(getCrossClients(todas, filtros, agoraMs()), ramos) }])}>Exportar</button>
        </>
      }
    >
      <div className="ret-table-wrap" id="cross-table-wrap">
        <table className="ret-table">
          <thead>
            <tr>
              {th("nome", "Nome")}
              <th>CPF/CNPJ{sp}</th>
              {ramos.map((r, i) => <th key={r} style={{ textAlign: "center" }} title={r}>{r}{i === ultimo ? sp : null}</th>)}
              {th("apolicesAtivas", "Apólices ativas", "right")}
              {th("ltv", "LTV", "right")}
            </tr>
          </thead>
          <tbody>
            {t.linhas.length ? t.linhas.map((c, i) => (
              <tr key={i}>
                <td className="name-cell" title={c.nome}>{c.nome}{sp}</td>
                <td className="num" style={{ fontFamily: "var(--font-mono)" }}>{c.doc}{sp}</td>
                {c.ramos.map((tem, j) => (
                  <td key={ramos[j]} style={{ textAlign: "center", color: tem ? "var(--pos-text)" : "var(--text-tertiary)" }}>{tem ? "✅" : "—"}{j === ultimo ? sp : null}</td>
                ))}
                <td className="num">{c.apolicesAtivas}{sp}</td>
                <td className="num">{c.ltv}{sp}</td>
              </tr>
            )) : (
              <tr><td colSpan={3 + ramos.length} style={{ textAlign: "center", color: "var(--text-tertiary)" }}>Nenhum cliente encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {" "}
      <div id="cross-table-pagination" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderTop: "1px solid var(--border-subtle)" }}>
        {t.total === 0 ? null : (
          <>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fN(t.inicio + 1)}–{fN(t.inicio + t.naPagina)} de {fN(t.total)}</span>
            {" "}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button type="button" className="btn-sm" style={BTN} disabled={t.pagina <= 1} onClick={() => e.irPara(t.pagina - 1)}>← Anterior</button>
              {" "}
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Página {t.pagina} de {t.totalPaginas}</span>
              {" "}
              <button type="button" className="btn-sm" style={BTN} disabled={t.pagina >= t.totalPaginas} onClick={() => e.irPara(t.pagina + 1)}>Próxima →</button>
            </div>
          </>
        )}
      </div>
    </SecaoRecolhivel>
  );
}
