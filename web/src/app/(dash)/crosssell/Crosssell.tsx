"use client";
import { useMemo } from "react";
import { agoraMs } from "@/client/agora";
import { buildCrossMap, filtrarClientesCross, getCrossRamoList } from "@/domain/crosssell";
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
  // O mapa por CPF/CNPJ (a parte cara, uma passada sobre ALL) só depende da base e da pessoa. Cada bloco filtra o mapa
  // com as próprias entradas: digitar na busca refaz só a lista da tabela (no antigo, onCrossSearch só redesenhava a tabela).
  const mapa = useMemo(() => buildCrossMap(todas, pessoa), [todas, pessoa]);
  const clientesKpi = useMemo(() => filtrarClientesCross(mapa, { col, busca: buscaKpi }, agoraMs()), [mapa, col, buscaKpi]);
  const clientesPen = useMemo(() => filtrarClientesCross(mapa, { col, busca: buscaPen }, agoraMs()), [mapa, col, buscaPen]);
  const clientesTabela = useMemo(() => filtrarClientesCross(mapa, { col, busca }, agoraMs()), [mapa, col, busca]);
  return (
    <>
      <FiltrosCross e={e} />
      {" "}
      <BlocoKpis todas={todas} clientes={clientesKpi} ramos={ramos} />
      {" "}
      <div className="charts-grid" style={{ marginBottom: 14 }}>
        <BlocoPenetracao todas={todas} clientes={clientesPen} ramos={ramos} modo={e.modo} aoMudarModo={e.setModo} />
        {" "}
        <BlocoNivel clientes={clientesKpi} />
      </div>
      {" "}
      <BlocoCampanha todas={todas} />
      {" "}
      <BlocoTabela todas={todas} clientes={clientesTabela} ramos={ramos} e={e} />
    </>
  );
}
