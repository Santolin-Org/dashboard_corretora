"use client";
import { useMemo } from "react";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import { baixarPlanilha } from "@/client/exportar";
import {
  buildMetasEquipeCards, buildMetasGroupData, exportacaoMetasColab, exportacaoMetasEquipe, filtrarMetas, getMetaPcts, getMetasBasePeriod,
  ordenarMetasColab, rotuloBaseMetas,
} from "@/domain/metas";
import { buildMetasSemanal } from "@/domain/metas-semanal";
import { BlocoColab } from "./BlocoColab";
import { BlocoEquipes } from "./BlocoEquipes";
import { BlocoSemanal } from "./BlocoSemanal";
import { useEstadoMetas } from "./estado";

// Aba Metas (#tab-metas; o PainelAba já envolve). Lê a base inteira (ALL) com os filtros globais do topo, deslocando a
// vigência um ano para trás (a "base" da meta). A meta é a base × (1 + % digitado) — um % para Novos e outro para
// Renovações. Os cartões, o acompanhamento semanal e a tabela por colaborador derivam todos dos mesmos % e filtros.
export default function Metas() {
  const { base } = usePainel();
  const { filtros } = useFiltros();
  const e = useEstadoMetas();
  const linhas = base.linhas, hoje = base.hoje;
  const { mn, mr } = getMetaPcts(e.novos, e.renov);
  const temDados = linhas.length > 0;
  const rotulo = temDados ? rotuloBaseMetas(getMetasBasePeriod(filtros, hoje)) : "—";
  const cards = useMemo(() => (temDados ? buildMetasEquipeCards(linhas, filtros, hoje, mn, mr) : null), [temDados, linhas, filtros, hoje, mn, mr]);
  const semanal = useMemo(() => buildMetasSemanal(linhas, filtros, hoje, mn, mr), [linhas, filtros, hoje, mn, mr]);
  const colabs = useMemo(() => buildMetasGroupData(filtrarMetas(linhas, filtros, hoje), mn, mr), [linhas, filtros, hoje, mn, mr]);
  const ordenadas = useMemo(() => ordenarMetasColab(colabs, e.ordem), [colabs, e.ordem]);
  const exportar = (tipo: "colab" | "equipe") => {
    if (!temDados) return;
    const data = filtrarMetas(linhas, filtros, hoje);
    if (tipo === "colab") void baixarPlanilha("Metas_Colaboradores.xlsx", [{ nome: "Metas_Colaboradores", linhas: exportacaoMetasColab(data, mn, mr) }]);
    else void baixarPlanilha("Metas_Equipe.xlsx", [{ nome: "Metas_Equipe", linhas: exportacaoMetasEquipe(data, mn, mr) }]);
  };
  const campo = (id: string, rot: string, valor: string, aoMudar: (v: string) => void) => (
    <div className="f-group">
      <span className="f-label">{rot}</span>
      {" "}
      <div className="meta-input-wrap">
        <input type="number" id={id} value={valor} min={0} max={500} step={0.5} onChange={(ev) => aoMudar(ev.target.value)} />
        {" "}
        <span className="meta-pct-sym">%</span>
      </div>
    </div>
  );
  return (
    <>
      <div className="metas-inputs-bar">
        {campo("meta-novos-pct", "% Meta — Novos", e.novos, e.setNovos)}
        {" "}
        {campo("meta-renov-pct", "% Meta — Renovações", e.renov, e.setRenov)}
        {" "}
        <div className="metas-base-label" id="metas-base-label">{rotulo}</div>
      </div>
      {" "}
      <BlocoEquipes cards={cards} aoExportar={() => exportar("equipe")} />
      {" "}
      <BlocoSemanal dados={semanal} temDados={temDados} e={e} />
      {" "}
      <BlocoColab linhas={ordenadas} e={e} pcts={{ mn, mr }} aoExportar={() => exportar("colab")} />
    </>
  );
}
