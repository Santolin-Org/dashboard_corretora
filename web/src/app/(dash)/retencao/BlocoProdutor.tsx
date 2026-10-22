"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { alternarOrdemRet, exportacaoChurn, tabelaChurn, type BadgeChurn, type FiltrosRetencao, type OrdemRet, type PeriodoRet, type VisaoRet } from "@/domain/retencao";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { baixarPlanilha } from "@/client/exportar";
import s from "./Retencao.module.css";

const CLASSE: Record<BadgeChurn["classe"], string> = { "churn-badge-red": s.churnBadgeRed, "churn-badge-amber": s.churnBadgeAmber, "churn-badge-green": s.churnBadgeGreen };
/** churnBadge. O espaço depois da célula reproduz a quebra de linha entre <td> do template antigo. */
export const Badge = ({ b }: { b: BadgeChurn }) => <span className={`${s.churnBadge} ${CLASSE[b.classe]} churn-badge ${b.classe}`}>{b.texto}</span>;

// renderRetProdTable: #sc-ret-prod com #ret-prod-badge, Exportar (exportData('churn')), rádio vt-ret e #ret-prod-table-wrap.
// Ordenação inicial: % Churn itens desc (retSortKey/retSortDir do topo do main.js).
export function BlocoProdutor({ todas, f, p, visao, aoMudarVisao, ordem, aoOrdenar }: {
  todas: Linha[]; f: FiltrosRetencao; p: PeriodoRet; visao: VisaoRet; aoMudarVisao(v: VisaoRet): void; ordem: OrdemRet; aoOrdenar(o: OrdemRet): void;
}) {
  const t = useMemo(() => tabelaChurn(todas, f, p, visao, ordem), [todas, f, p, visao, ordem]);
  const sp = " "; // quebra de linha entre as células no template do antigo
  return (
    <SecaoRecolhivel
      chave="ret-prod"
      cabecalho={<SecaoTitulo>Churn por produtor{" "}<SecaoBadge id="ret-prod-badge">{t.badge}</SecaoBadge></SecaoTitulo>}
      controles={
        <>
          <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px", marginRight: 8 }}
            onClick={() => void baixarPlanilha("Export_Churn.xlsx", [{ nome: "Churn", linhas: exportacaoChurn(todas, f, p, visao) }])}>Exportar</button>
          {" "}
          <div className="view-toggle">
            <input type="radio" name="vt-ret" id="vt-ret-colab" value="colab" checked={visao === "colab"} onChange={() => aoMudarVisao("colab")} />
            {" "}
            <label htmlFor="vt-ret-colab">Colaborador</label>
            {" "}
            <input type="radio" name="vt-ret" id="vt-ret-grp" value="grp" checked={visao === "grp"} onChange={() => aoMudarVisao("grp")} />
            {" "}
            <label htmlFor="vt-ret-grp">Grupo</label>
          </div>
        </>
      }
    >
      <div className="ret-table-wrap" id="ret-prod-table-wrap">
        <table className="ret-table">
          <thead>
            <tr>
              {t.cabecalhos.map((h) => (
                <th key={h.chave} className={`ret-sortable ${h.classe}`} style={{ textAlign: h.alinhar }} onClick={() => aoOrdenar(alternarOrdemRet(ordem, h.chave))}>{h.rotulo}<span className="sort-icon" />{sp}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.linhas.map((r) => (
              <tr key={r.nomeCompleto}>
                <td className="name-cell" title={r.nomeCompleto}>{r.nome}{sp}</td>
                <td className="num">{r.qtdBase}{sp}</td>
                <td className="num">{r.qtdCancel}{sp}</td>
                <td className="num"><Badge b={r.pctQtd} />{sp}</td>
                <td className="num">{r.premioBase}{sp}</td>
                <td className="num">{r.premioCancel}{sp}</td>
                <td className="num"><Badge b={r.pctPremio} />{sp}</td>
                <td className="num">{r.comPerdida}{sp}</td>
                <td className="num"><Badge b={r.pctCom} />{sp}</td>
                <td className="num">{r.canceladas}{sp}</td>
                <td className="num"><Badge b={r.pctCanc} />{sp}</td>
                <td className="num" style={{ color: "#BA7517" }}>{r.vencidas}{sp}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total{sp}</td>
              <td className="num">{t.total.qtdBase}{sp}</td>
              <td className="num">{t.total.qtdCancel}{sp}</td>
              <td className="num"><Badge b={t.total.pctQtd} />{sp}</td>
              <td className="num">{t.total.premioBase}{sp}</td>
              <td className="num">{t.total.premioCancel}{sp}</td>
              <td className="num"><Badge b={t.total.pctPremio} />{sp}</td>
              <td className="num">{t.total.comPerdida}{sp}</td>
              <td className="num"><Badge b={t.total.pctCom} />{sp}</td>
              <td className="num">{t.total.canceladas}{sp}</td>
              <td className="num"><Badge b={t.total.pctCanc} />{sp}</td>
              <td className="num">{t.total.vencidas}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </SecaoRecolhivel>
  );
}
