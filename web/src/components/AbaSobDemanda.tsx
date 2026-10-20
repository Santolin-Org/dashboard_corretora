"use client";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { PainelAba } from "./PainelAba";

// Conteúdo de cada rota carregado sob demanda (um chunk por aba). As tarefas de porte
// trocam o EmMigracao pelo componente da aba aqui.
const emMigracao = () => import("./EmMigracao");
const CONTEUDO: Record<string, ComponentType> = {
  "visao-geral": dynamic(emMigracao),
  producao: dynamic(emMigracao),
  retencao: dynamic(emMigracao),
  crosssell: dynamic(emMigracao),
  comparativo: dynamic(emMigracao),
  metas: dynamic(emMigracao),
  sinistros: dynamic(emMigracao),
  "exibicao-tv": dynamic(emMigracao),
  apresentacao: dynamic(emMigracao),
};

// Telas cheias (sem .tab-pane): contêiner com o id que o app antigo usava.
const TELA_CHEIA: Record<string, string> = { "exibicao-tv": "tv-exibicao", apresentacao: "kickoff-mode" };

export function AbaSobDemanda({ id }: { id: keyof typeof CONTEUDO & string }) {
  const Conteudo = CONTEUDO[id];
  if (TELA_CHEIA[id]) return <div id={TELA_CHEIA[id]}><Conteudo /></div>;
  return <PainelAba id={id}><Conteudo /></PainelAba>;
}
