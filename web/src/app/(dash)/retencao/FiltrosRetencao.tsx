"use client";
import { useEffect, useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { FILTROS_RET_INICIAIS, opcoesRetencao, periodoPadraoRet, type PeriodoRet } from "@/domain/retencao";
import { MultiSelect } from "@/components/MultiSelect";
import b from "@/components/BotoesTipo.module.css";
import { VISUAL_INICIAL, type useEstadoRetencao } from "./estado";
import s from "./Retencao.module.css";

type Estado = ReturnType<typeof useEstadoRetencao>;

// .ret-filter-card: filtros próprios da aba (período, colaborador, ramo, grupo, motivo, tipo, só evitável).
// Independentes dos filtros globais (a aba lê ALL inteiro).
export function FiltrosRetencao({ todas, hoje, e }: { todas: Linha[]; hoje: string; e: Estado }) {
  const { filtros, setFiltros, periodo, setPeriodo, colRemontagem, setColRemontagem, visual, setVisual } = e;
  useEffect(() => { e.sincronizarGeracao(); });
  // populateFilters (a cada carga de dados) remonta ms-ret-col com o RET_MS.col atual.
  useEffect(() => {
    if (e.linhasVistas !== todas) { e.setLinhasVistas(todas); setColRemontagem(filtros.col); }
  });

  // buildRetColabOptions: remontado só quando o período muda ou no "Limpar" da aba, com os marcados daquele momento.
  const opcoes = useMemo(() => opcoesRetencao(todas, periodo, colRemontagem), [todas, periodo, colRemontagem]);

  const mudarPeriodo = (p: Partial<PeriodoRet>) => {
    setPeriodo({ ...periodo, ...p });
    setColRemontagem(filtros.col);
  };
  const alternarTipo = (t: "R" | "N") => {
    const tem = filtros.tipos.includes(t);
    setFiltros({ ...filtros, tipos: tem ? filtros.tipos.filter((x) => x !== t) : [...filtros.tipos, t] });
    setVisual({ ...visual, [t]: !tem });
  };
  const alternarEvitavel = () => {
    setFiltros({ ...filtros, soEvitavel: !filtros.soEvitavel });
    setVisual({ ...visual, evitavel: !filtros.soEvitavel });
  };
  // resetRetFilters
  const limpar = () => {
    setPeriodo(periodoPadraoRet(hoje));
    setFiltros(FILTROS_RET_INICIAIS);
    setColRemontagem([]);
    setVisual(VISUAL_INICIAL);
  };
  const botao = (ativo: boolean) => `${b.tipoBtn} tipo-btn${ativo ? " active" : ""}`;
  const grupo = `${s.fGroup} f-group`, rotulo = `${s.fLabel} f-label`;

  return (
    <div className={`${s.retFilterCard} ret-filter-card`}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".5px", width: "100%" }}>Filtros desta aba</div>
      {" "}
      <div className={grupo}>
        <span className={rotulo} title="Base = apólices em vigor em algum dia do período. Perda = cancelada ou vencida dentro do período. Padrão: 1º de janeiro até hoje.">Período de análise</span>
        {" "}
        <div className={`${s.datePair} date-pair`}>
          <input type="date" id="ret-per-s" value={periodo.s} onChange={(ev) => mudarPeriodo({ s: ev.target.value })} />
          <span className={`${s.dateSep} date-sep`}>→</span>
          <input type="date" id="ret-per-e" value={periodo.e} onChange={(ev) => mudarPeriodo({ e: ev.target.value })} />
        </div>
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Colaborador</span>
        {" "}
        <MultiSelect id="ms-ret-col" chave="col" valores={opcoes.col} selecionados={filtros.col} placeholder="Todos" onChange={(col) => setFiltros({ ...filtros, col })} />
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Ramo</span>
        {" "}
        <MultiSelect id="ms-ret-ram" chave="ram" valores={opcoes.ram} selecionados={filtros.ram} placeholder="Todos" onChange={(ram) => setFiltros({ ...filtros, ram })} />
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Grupo de produção</span>
        {" "}
        <MultiSelect id="ms-ret-grp" chave="grp" valores={opcoes.grp} selecionados={filtros.grp} placeholder="Todos" onChange={(grp) => setFiltros({ ...filtros, grp })} />
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Motivo cancelamento</span>
        {" "}
        <MultiSelect id="ms-ret-mot" chave="mot" valores={opcoes.mot} selecionados={filtros.mot} placeholder="Todos" onChange={(mot) => setFiltros({ ...filtros, mot })} />
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo}>Tipo</span>
        {" "}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" className={botao(visual.R)} id="ret-tipo-R" onClick={() => alternarTipo("R")}>R — Renovação</button>
          {" "}
          <button type="button" className={botao(visual.N)} id="ret-tipo-N" onClick={() => alternarTipo("N")}>N — Novo</button>
        </div>
      </div>
      {" "}
      <div className={grupo}>
        <span className={rotulo} title="Tira da conta os cancelamentos que a corretora não tinha como evitar: venda do bem, reemissão, erro de emissão, falecimento, perda total. Sem motivo conta como evitável.">Churn</span>
        {" "}
        <button type="button" className={botao(visual.evitavel)} id="ret-evitavel-btn" onClick={alternarEvitavel}>Só evitável</button>
      </div>
      {" "}
      <div className={grupo} style={{ marginLeft: "auto", justifyContent: "flex-end" }}>
        <button type="button" className="btn-sm" onClick={limpar}>↻ Limpar</button>
      </div>
    </div>
  );
}
