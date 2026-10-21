"use client";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { fBRL, fP } from "@/domain/formatos";
import { nomeCurtoColab, totaisMetasColab, type ChaveMetas, type LinhaMetasColab } from "@/domain/metas";
import type { EstadoMetas } from "./estado";

const sp = " ";
const MC = "meta-cell";
const BORDA = { borderLeft: "1px solid var(--border-subtle)" } as const;

// renderMetasColabTable: #sc-metas-colab com #metas-colab-badge, Exportar, rádios vt-metas e #metas-colab-wrap.
// Ordenação inicial: Prod. Anterior desc (metaSortKey/metaSortDir do topo do main.js). Na visão "Total" o antigo não
// emite espaço entre as células; na de detalhe há quebra de linha por grupo de células (reproduzida com `sp`).
export function BlocoColab({ linhas: rows, e, pcts, aoExportar }: { linhas: LinhaMetasColab[]; e: EstadoMetas; pcts: { mn: number; mr: number }; aoExportar(): void }) {
  const { ordem, visao } = e;
  const cls = (k: ChaveMetas, extra = "") => `${k === ordem.chave ? (ordem.dir === "asc" ? "sort-asc" : "sort-desc") : ""}${extra}`;
  const t = totaisMetasColab(rows);
  const th = (k: ChaveMetas, rotulo: string, meta: boolean) => (
    <th className={meta ? `${cls(k)} ${MC}` : cls(k)} style={{ textAlign: "right" }} onClick={() => e.ordenar(k)}>{rotulo}<span className="sort-icon" /></th>
  );
  const thL = (
    <th className={cls("nome")} onClick={() => e.ordenar("nome")}>Colaborador<span className="sort-icon" /></th>
  );
  let corpo;
  if (!rows.length) {
    corpo = <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Nenhum dado encontrado no período base com os filtros atuais.</div>;
  } else if (visao === "total") {
    const pA = t.totalAnt ? t.totalComAnt / t.totalAnt : 0, pM = t.metaTotalProd ? t.metaTotalCom / t.metaTotalProd : 0;
    corpo = (
      <table className="prod-table">
        <thead><tr>{thL}{th("totalAnt", "Prod. Anterior", false)}{th("totalComAnt", "Com. Anterior", false)}{th("pctComAnt", "% Com. Ant.", false)}{th("metaTotalProd", "Meta Prod.", true)}{th("metaTotalCom", "Meta Com.", true)}{th("pctMetaCom", "% Com. Meta", true)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nome}>
              <td className="name-cell" title={r.nome}>{nomeCurtoColab(r.nome)}</td><td className="num">{fBRL(r.totalAnt)}</td><td className="num">{fBRL(r.totalComAnt)}</td><td className="num">{fP(r.pctComAnt)}</td>
              <td className={`num ${MC}`}>{fBRL(r.metaTotalProd)}</td><td className={`num ${MC}`}>{fBRL(r.metaTotalCom)}</td><td className={`num ${MC}`}>{fP(r.pctMetaCom)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total geral</td><td className="num">{fBRL(t.totalAnt)}</td><td className="num">{fBRL(t.totalComAnt)}</td><td className="num">{fP(pA)}</td>
            <td className={`num ${MC}`}>{fBRL(t.metaTotalProd)}</td><td className={`num ${MC}`}>{fBRL(t.metaTotalCom)}</td><td className={`num ${MC}`}>{fP(pM)}</td>
          </tr>
        </tfoot>
      </table>
    );
  } else {
    const { mn, mr } = pcts;
    const pctN = (mn * 100).toFixed(1), pctR = (mr * 100).toFixed(1);
    const bloco = (borda: boolean, a: number, b: number, c: number, mp: number, mc2: number) => (
      <>
        <td className="num" style={borda ? BORDA : undefined}>{fBRL(a)}</td><td className="num">{fBRL(b)}</td><td className="num">{fP(c)}{sp}</td>
        <td className={`num ${MC}`}>{fBRL(mp)}</td><td className={`num ${MC}`}>{fBRL(mc2)}{sp}</td>
      </>
    );
    corpo = (
      <table className="prod-table metas-table-det">
        <thead>
          <tr className="meta-group-header-row">
            <th rowSpan={2} style={{ textAlign: "left", verticalAlign: "bottom", minWidth: 160 }} onClick={() => e.ordenar("nome")}>Colaborador<span className="sort-icon" />{sp}</th>
            <th colSpan={3} style={{ textAlign: "center", ...BORDA }}>Novos — base{sp}</th>
            <th colSpan={2} className={MC} style={{ textAlign: "center" }}>↗ Meta Novos ({pctN}%){sp}</th>
            <th colSpan={3} style={{ textAlign: "center", ...BORDA }}>Renovações — base{sp}</th>
            <th colSpan={2} className={MC} style={{ textAlign: "center" }}>↗ Meta Renov. ({pctR}%){sp}</th>
            <th colSpan={3} style={{ textAlign: "center", ...BORDA }}>Total{sp}</th>
            <th colSpan={2} className={MC} style={{ textAlign: "center" }}>↗ Meta Total{sp}</th>
          </tr>
          <tr>
            <th className="num" style={BORDA}>Prêmio</th><th className="num">Comissão</th><th className="num">% Com.{sp}</th>
            <th className={`num ${MC}`}>Prêmio</th><th className={`num ${MC}`}>Comissão{sp}</th>
            <th className="num" style={BORDA}>Prêmio</th><th className="num">Comissão</th><th className="num">% Com.{sp}</th>
            <th className={`num ${MC}`}>Prêmio</th><th className={`num ${MC}`}>Comissão{sp}</th>
            <th className="num" style={BORDA}>Prêmio</th><th className="num">Comissão</th><th className="num">% Com.{sp}</th>
            <th className={`num ${MC}`}>Prêmio</th><th className={`num ${MC}`}>Comissão{sp}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nome}>
              <td className="name-cell" title={r.nome}>{nomeCurtoColab(r.nome)}{sp}</td>
              {bloco(true, r.np, r.nc, r.np ? r.nc / r.np : 0, r.metaNProd, r.metaNCom)}
              {bloco(true, r.rp, r.rc, r.rp ? r.rc / r.rp : 0, r.metaRProd, r.metaRCom)}
              {bloco(true, r.totalAnt, r.totalComAnt, r.pctComAnt, r.metaTotalProd, r.metaTotalCom)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total geral{sp}</td>
            {bloco(true, t.np, t.nc, t.np ? t.nc / t.np : 0, t.metaNProd, t.metaNCom)}
            {bloco(true, t.rp, t.rc, t.rp ? t.rc / t.rp : 0, t.metaRProd, t.metaRCom)}
            {bloco(true, t.totalAnt, t.totalComAnt, t.totalAnt ? t.totalComAnt / t.totalAnt : 0, t.metaTotalProd, t.metaTotalCom)}
          </tr>
        </tfoot>
      </table>
    );
  }
  return (
    <SecaoRecolhivel
      chave="metas-colab"
      cabecalho={<SecaoTitulo>Metas por colaborador{" "}<SecaoBadge id="metas-colab-badge">{rows.length} colaboradores</SecaoBadge></SecaoTitulo>}
      controles={
        <>
          <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px", marginRight: 8 }} onClick={aoExportar}>Exportar</button>
          {" "}
          <div className="view-toggle">
            <input type="radio" name="vt-metas" id="vt-metas-tot" value="total" checked={visao === "total"} onChange={() => e.setVisao("total")} />
            {" "}
            <label htmlFor="vt-metas-tot">Total</label>
            {" "}
            <input type="radio" name="vt-metas" id="vt-metas-det" value="detalhe" checked={visao === "detalhe"} onChange={() => e.setVisao("detalhe")} />
            {" "}
            <label htmlFor="vt-metas-det">Novos / Renovações</label>
          </div>
        </>
      }
    >
      <div className="prod-table-wrap" id="metas-colab-wrap">{corpo}</div>
    </SecaoRecolhivel>
  );
}
