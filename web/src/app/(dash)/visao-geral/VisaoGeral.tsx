"use client";
import { usePainel } from "@/client/painel";
import { useFiltros } from "@/client/filtros";
import { BlocoKpis } from "./BlocoKpis";
import { BlocoEvolucao } from "./BlocoEvolucao";
import { BlocoCancelamentos } from "./BlocoCancelamentos";
import { BlocoSeguradora } from "./BlocoSeguradora";
import { BlocoRamo } from "./BlocoRamo";

// Aba Visão geral (#tab-visao-geral; o PainelAba já envolve). Padrão de porte das abas:
// domínio puro em @/domain/visao-geral, um componente por bloco, estado de controles local à aba.
export default function VisaoGeral() {
  const { base } = usePainel();
  const { filtros, fd, geracaoLimpeza } = useFiltros();
  // renderKPIs: sem nenhuma data de vigência/emissão preenchida, os KPIs olham só o ano corrente.
  const semFiltroDeData = !filtros.vigIni && !filtros.vigFim && !filtros.emIni && !filtros.emFim;
  return (
    <>
      <BlocoKpis fd={fd} hoje={base.hoje} semFiltroDeData={semFiltroDeData} />
      {" "}
      <div className="charts-grid">
        <BlocoEvolucao fd={fd} hoje={base.hoje} />
        {" "}
        <BlocoCancelamentos fd={fd} geracaoLimpeza={geracaoLimpeza} />
        {" "}
        <BlocoSeguradora fd={fd} />
        {" "}
        <BlocoRamo fd={fd} />
      </div>
    </>
  );
}
