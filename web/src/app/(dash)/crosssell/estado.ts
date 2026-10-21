"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Linha } from "@/domain/tipos";
import { useEstadoAba } from "@/client/estadoAbas";
import { usePainel } from "@/client/painel";
import {
  ORDEM_CROSS_INICIAL, alternarOrdemCross, filtrosCrossIniciais, ramosPadraoCross,
  type ChaveOrdemCross, type FiltrosCross, type ModoPen, type OrdemCross, type Pessoa,
} from "@/domain/crosssell";

// Estado de UI da aba Cross-sell. No antigo vivia em globais (CROSS, crossSearch, crossSortKey/Dir, crossPage,
// crossPenMode) e no DOM (#cross-search), e sobrevivia à troca de aba: aqui fica na store da casca (useEstadoAba).
// O "Limpar filtros" global não mexe em nada disso (só initDashboard zera, ao carregar os dados).
//
// Quem redesenha o quê no antigo (reproduzido de propósito):
//  - renderCrossTab (trocar a pessoa, marcar ramo/colaborador, "↻ Limpar", voltar à aba): tudo, com a busca de agora;
//  - onCrossSearch: só a tabela (KPIs, penetração e nível ficam com a lista de antes da busca);
//  - setCrossPenMode: só a penetração (com a busca de agora); setCrossSort/setCrossPage: só a tabela.
// `buscaKpi` e `buscaPen` guardam a busca com que cada bloco foi desenhado pela última vez; começam na busca atual
// a cada montagem (showTab chama renderCrossTab).
export function useEstadoCross() {
  const { base } = usePainel();
  const todas = base.linhas;
  const inicial = useMemo(() => filtrosCrossIniciais(todas), [todas]); // buildCrossFilters na carga: ramos principais marcados
  const [filtros, setFiltros] = useEstadoAba<FiltrosCross>("crosssell:filtros", inicial);
  const [modo, setModoBruto] = useEstadoAba<ModoPen>("crosssell:modo", "penetracao");
  const [ordem, setOrdem] = useEstadoAba<OrdemCross>("crosssell:ordem", ORDEM_CROSS_INICIAL);
  const [pagina, setPagina] = useEstadoAba<number>("crosssell:pagina", 1);
  const [buscaKpi, setBuscaKpi] = useState(filtros.busca);
  const [buscaPen, setBuscaPen] = useState(filtros.busca);
  const redesenhaTudo = (busca: string) => { setBuscaKpi(busca); setBuscaPen(busca); };
  // Base nova (revalidação com versão nova) = initDashboard({ keepFilters: true }) do antigo (upload com o painel
  // aberto): pessoa, ramo, colaborador e busca ficam; populateFilters → buildCrossFilters remarca os ramos
  // principais se o ramo estiver vazio; as listas saem da base nova. A base vista fica na store, para valer
  // também quando a troca aconteceu com a aba desmontada. Ver docs/divergencias.md.
  // `{ l }`: um objeto novo por gravação, para a primeira gravação (montagem) chegar à store.
  const [baseVista, setBaseVista] = useEstadoAba<{ l: Linha[] }>("crosssell:base", { l: todas });
  const gravada = useRef(false);
  useEffect(() => {
    if (baseVista.l === todas) {
      if (!gravada.current) { gravada.current = true; setBaseVista({ l: todas }); }
      return;
    }
    gravada.current = true;
    setBaseVista({ l: todas });
    if (filtros.ram.length === 0) setFiltros({ ...filtros, ram: ramosPadraoCross(todas, filtros.pessoa) });
  }, [todas, baseVista, setBaseVista, filtros, setFiltros]);
  // showTab → renderCrossTab: com a base nova, todos os blocos são redesenhados com a busca atual
  // (ajuste de estado durante a renderização, sem efeito).
  const [buscaDaBase, setBuscaDaBase] = useState(todas);
  if (buscaDaBase !== todas) {
    setBuscaDaBase(todas);
    setBuscaKpi(filtros.busca);
    setBuscaPen(filtros.busca);
  }
  return {
    todas, filtros, modo, ordem, pagina, buscaKpi, buscaPen,
    // setCrossPessoa: limpa ramo e colaborador, remarca os ramos principais da pessoa; a busca fica.
    setPessoa(p: Pessoa) {
      setFiltros({ pessoa: p, ram: ramosPadraoCross(todas, p), col: [], busca: filtros.busca });
      setPagina(1); redesenhaTudo(filtros.busca);
    },
    // triggerFilter('ms-cross-*'): crossPage = 1; renderCrossTab.
    setRam(ram: string[]) { setFiltros({ ...filtros, ram }); setPagina(1); redesenhaTudo(filtros.busca); },
    setCol(col: string[]) { setFiltros({ ...filtros, col }); setPagina(1); redesenhaTudo(filtros.busca); },
    // onCrossSearch: crossPage = 1, só a tabela.
    setBusca(busca: string) { setFiltros({ ...filtros, busca }); setPagina(1); },
    // resetCrossFilters: ramo e colaborador vazios (= todos, sem remarcar os principais), busca vazia; a pessoa fica.
    limpar() { setFiltros({ ...filtros, ram: [], col: [], busca: "" }); setPagina(1); redesenhaTudo(""); },
    setModo(m: ModoPen) { setModoBruto(m); setBuscaPen(filtros.busca); },
    ordenar(chave: ChaveOrdemCross) { setOrdem(alternarOrdemCross(ordem, chave)); },
    irPara(n: number) { setPagina(n); },
    // renderCrossTable: crossPage fora de [1, totalPaginas] é limitado e gravado no global.
    limitarPagina(n: number) { if (n !== pagina) setPagina(n); },
  };
}
export type EstadoCross = ReturnType<typeof useEstadoCross>;
