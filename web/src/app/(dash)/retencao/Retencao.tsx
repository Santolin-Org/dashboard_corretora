"use client";
import { usePainel } from "@/client/painel";
import { BlocoKpis } from "./BlocoKpis";
import { BlocoGraficos } from "./BlocoGraficos";
import { BlocoProdutor } from "./BlocoProdutor";
import { BlocoDetalhe } from "./BlocoDetalhe";
import { FiltrosRetencao } from "./FiltrosRetencao";
import { useEstadoRetencao } from "./estado";

// Aba Retenção & Churn (#tab-retencao; o PainelAba já envolve). Os filtros são PRÓPRIOS da aba e independentes
// dos globais: tudo parte de `base.linhas` (ALL do antigo). O estado (filtros, período, visão, ordenação, filtro
// de situação do detalhe) fica na store da casca e sobrevive à troca de aba, como os globais/DOM do antigo.
export default function Retencao() {
  const { base } = usePainel();
  const e = useEstadoRetencao();
  const todas = base.linhas;
  // renderRetTab (e portanto retDetailPage = 1) roda a cada mudança de filtro, período e visão.
  const chaveRender = JSON.stringify([e.filtros, e.periodo, e.visao]);
  return (
    <>
      <FiltrosRetencao todas={todas} hoje={base.hoje} e={e} />
      {" "}
      <BlocoKpis todas={todas} f={e.filtros} p={e.periodo} />
      {" "}
      <BlocoGraficos todas={todas} f={e.filtros} p={e.periodo} hoje={base.hoje} />
      {" "}
      <BlocoProdutor todas={todas} f={e.filtros} p={e.periodo} visao={e.visao} aoMudarVisao={e.setVisao} ordem={e.ordem} aoOrdenar={e.setOrdem} />
      {" "}
      <BlocoDetalhe todas={todas} f={e.filtros} p={e.periodo} situacao={e.situacao} aoMudarSituacao={e.setSituacao} chaveRender={chaveRender} />
    </>
  );
}
