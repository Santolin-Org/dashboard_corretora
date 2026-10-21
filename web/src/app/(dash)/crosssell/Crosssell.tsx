"use client";
import { useMemo } from "react";
import { agoraMs } from "@/client/agora";
import { getCrossClients, getCrossRamoList, type ClienteCross } from "@/domain/crosssell";
import { BlocoCampanha } from "./BlocoCampanha";
import { BlocoKpis } from "./BlocoKpis";
import { BlocoNivel } from "./BlocoNivel";
import { BlocoPenetracao } from "./BlocoPenetracao";
import { BlocoTabela } from "./BlocoTabela";
import { FiltrosCross } from "./FiltrosCross";
import { useEstadoCross } from "./estado";

// Aba Cross-sell (#tab-crosssell; o PainelAba já envolve). Lê `base.linhas` (ALL) inteiro: os filtros globais do
// cabeçalho não valem aqui, só os filtros próprios (pessoa, ramo, colaborador, busca). Cada bloco usa a lista de
// clientes da busca com que foi desenhado pela última vez (ver estado.ts).
export default function Crosssell() {
  const e = useEstadoCross();
  const { todas, filtros, buscaKpi, buscaPen } = e;
  const { pessoa, ram, col, busca } = filtros;
  const ramos = useMemo(() => getCrossRamoList(todas, { pessoa, ram, col: [], busca: "" }), [todas, pessoa, ram]);
  // getCrossClients por busca distinta (no mais três: KPIs/nível, penetração e tabela), calculado uma vez cada.
  const porBusca = useMemo(() => {
    const m = new Map<string, ClienteCross[]>();
    for (const b of new Set([buscaKpi, buscaPen, busca])) m.set(b, getCrossClients(todas, { pessoa, ram, col, busca: b }, agoraMs()));
    return m;
  }, [todas, pessoa, ram, col, buscaKpi, buscaPen, busca]);
  return (
    <>
      <FiltrosCross e={e} />
      {" "}
      <BlocoKpis todas={todas} clientes={porBusca.get(buscaKpi)!} ramos={ramos} />
      {" "}
      <div className="charts-grid" style={{ marginBottom: 14 }}>
        <BlocoPenetracao todas={todas} clientes={porBusca.get(buscaPen)!} ramos={ramos} modo={e.modo} aoMudarModo={e.setModo} />
        {" "}
        <BlocoNivel clientes={porBusca.get(buscaKpi)!} />
      </div>
      {" "}
      <BlocoCampanha todas={todas} />
      {" "}
      <BlocoTabela todas={todas} clientes={porBusca.get(busca)!} ramos={ramos} e={e} />
    </>
  );
}
