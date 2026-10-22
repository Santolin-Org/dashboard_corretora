"use client";
import { usePainel } from "@/client/painel";
import { useFiltros } from "@/client/filtros";
import { useEstadoAba } from "@/client/estadoAbas";
import { fN } from "@/domain/formatos";
import { rotuloVisao, type Visao } from "@/domain/producao-aba";
import type { Metrica } from "@/domain/visao-geral";
import { BlocoKpis } from "./BlocoKpis";
import { BlocoEvolucao } from "./BlocoEvolucao";
import { BlocoTabela } from "./BlocoTabela";

// Aba Produção (#tab-producao; o PainelAba já envolve). Os controles (visão, métricas, períodos,
// ordenação) ficam na store da casca: sobrevivem à troca de aba, como o DOM/globais do antigo.
export const CHAVE_VISAO = "producao:visao";
export const CHAVE_METRICA_TABELA = "producao:mt-tbl";

export default function Producao() {
  const { base } = usePainel();
  const { fd } = useFiltros();
  const [visao, setVisao] = useEstadoAba<Visao>(CHAVE_VISAO, "colab"); // vt-colab marcado de início
  const [metricaTabela, setMetricaTabela] = useEstadoAba<Metrica>(CHAVE_METRICA_TABELA, "comissao"); // mt-tbl-c marcado de início
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="view-toggle">
          <input type="radio" name="vt" id="vt-colab" value="colab" checked={visao === "colab"} onChange={() => setVisao("colab")} />
          {" "}
          <label htmlFor="vt-colab">Por colaborador</label>
          {" "}
          <input type="radio" name="vt" id="vt-grp" value="grp" checked={visao === "grp"} onChange={() => setVisao("grp")} />
          {" "}
          <label htmlFor="vt-grp">Por grupo de produção</label>
        </div>
        {" "}
        <span id="prod-view-label" style={{ fontSize: 11, color: "#999" }}>{fN(fd.length) + " registros · " + rotuloVisao(visao)}</span>
      </div>
      {" "}
      <BlocoKpis fd={fd} visao={visao} />
      {" "}
      <BlocoEvolucao fd={fd} todas={base.linhas} hoje={base.hoje} />
      {" "}
      <BlocoTabela fd={fd} visao={visao} metricaTabela={metricaTabela} aoMudarMetrica={setMetricaTabela} />
    </>
  );
}
