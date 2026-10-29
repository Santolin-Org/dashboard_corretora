"use client";
import { useMemo } from "react";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import { dadosComp, periodoComp } from "@/domain/comparativo";
import { BlocoGrafico } from "./BlocoGrafico";
import { BlocoKpis } from "./BlocoKpis";
import { BlocoPivo } from "./BlocoPivo";
import { BlocoRanking } from "./BlocoRanking";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { useEstadoComp } from "./estado";

// Aba Comparativo de períodos (#tab-comparativo; o PainelAba já envolve). Gráfico, KPIs e ranking leem a base inteira
// (ALL) com os filtros globais do topo (matchesCompScope); o pivô lê FD. O período segue: manual da aba > vigência
// global > 1º de janeiro até hoje.
export default function Comparativo() {
  const { base } = usePainel();
  const { filtros, fd, geracaoLimpeza } = useFiltros();
  const e = useEstadoComp();
  const per = periodoComp(e.manual, filtros, base.hoje);
  const d = useMemo(() => dadosComp(base.linhas, filtros, { start: per.start, end: per.end }), [base.linhas, filtros, per.start, per.end]);
  return (
    <>
      <FiltroPeriodo e={e} per={per} d={d} filtros={filtros} geracao={geracaoLimpeza} />
      {" "}
      <BlocoGrafico d={d} metrica={e.metrica} aoMudar={e.setMetrica} hoje={base.hoje}
        agrupamento={e.agrupamento} aoMudarAgrupamento={e.setAgrupamento} base={e.baseComparacao} aoMudarBase={e.setBaseComparacao} />
      {" "}
      <BlocoKpis todas={base.linhas} filtros={filtros} d={d} renovacaoSoMeta={e.renovacaoSoMeta} aoMudarRenovacaoSoMeta={e.setRenovacaoSoMeta} />
      {" "}
      <BlocoPivo fd={fd} e={e} />
      {" "}
      <BlocoRanking atual={d.atual} anterior={d.anterior} dim={e.dim} metrica={e.metricaRank} aoMudarDim={e.setDim} aoMudarMetrica={e.setMetricaRank} />
    </>
  );
}
