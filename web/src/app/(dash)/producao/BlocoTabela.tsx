"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { ORDEM_INICIAL, alternarOrdenacao, exportacaoProducao, tabelaProducao, type Ordem, type Visao } from "@/domain/producao-aba";
import type { Metrica } from "@/domain/visao-geral";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { baixarPlanilha } from "@/client/exportar";
import { useEstadoAba } from "@/client/estadoAbas";
import { ToggleMetrica } from "../visao-geral/ToggleMetrica";

// renderProdTable: #sc-table com #prod-table-badge, botão Exportar (exportData('producao')), rádio mt-tbl e
// #prod-table-wrap. Ordenação inicial: Prêmio líquido desc (sortKey/sortDir do topo do main.js).
export function BlocoTabela({ fd, visao, metricaTabela, aoMudarMetrica }: {
  fd: Linha[]; visao: Visao; metricaTabela: Metrica; aoMudarMetrica(m: Metrica): void;
}) {
  const [ordem, setOrdem] = useEstadoAba<Ordem>("producao:ordem", ORDEM_INICIAL);
  const t = useMemo(() => tabelaProducao(fd, visao, metricaTabela, ordem.chave, ordem.dir), [fd, visao, metricaTabela, ordem]);
  return (
    <SecaoRecolhivel
      chave="table"
      cabecalho={<SecaoTitulo>Tabela de produção{" "}<SecaoBadge id="prod-table-badge">{t.badge}</SecaoBadge></SecaoTitulo>}
      controles={
        <>
          <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px", marginRight: 8 }}
            onClick={() => void baixarPlanilha("Export_Producao.xlsx", [{ nome: "Producao", linhas: exportacaoProducao(fd, visao, metricaTabela) }])}>Exportar</button>
          {" "}
          <ToggleMetrica nome="mt-tbl" valor={metricaTabela} aoMudar={aoMudarMetrica} />
        </>
      }
    >
      <div className="prod-table-wrap" id="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: "center" }}>#</th>
              {t.cabecalhos.map((h) => (
                <th key={h.chave} className={h.classe} style={{ textAlign: h.alinhar }} onClick={() => setOrdem(alternarOrdenacao(ordem, h.chave))}>{h.rotulo}<span className="sort-icon" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.linhas.map((r, i) => (
              <tr key={r.nomeCompleto}>
                <td style={{ textAlign: "center", width: 36 }}><span className={`rank-badge ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}`}>{r.posicao}</span></td>
                <td className="name-cell" title={r.nomeCompleto}>{r.nome}</td>
                <td className="num">{r.premio}<div className="bar-bg"><div className="bar-fg" style={{ width: `${r.barraPremio}%`, background: "#378ADD40" }} /></div></td>
                <td className="num">{r.com}</td>
                <td className="num">{r.pctCom}</td>
                <td className="num">{r.ticket}</td>
                <td className="num">{r.qtd}</td>
                <td className="num"><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{r.pctTotal}<span style={{ display: "inline-block", width: r.larguraPart, height: 6, background: "#378ADD", borderRadius: 3, minWidth: 2 }} /></span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total geral</td>
              <td className="num">{t.total.premio}</td>
              <td className="num">{t.total.com}</td>
              <td className="num">{t.total.pctCom}</td>
              <td className="num">{t.total.ticket}</td>
              <td className="num">{t.total.qtd}</td>
              <td className="num">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </SecaoRecolhivel>
  );
}
