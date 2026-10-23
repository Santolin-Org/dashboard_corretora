"use client";
import { usePainel } from "@/client/painel";
import { mesDe, nomeMes } from "@/domain/painel-produtor";
import { BlocoProducaoMes } from "./BlocoProducaoMes";
import { ListaRenovar } from "./ListaRenovar";
import { GraficoMesAMes } from "./GraficoMesAMes";
import s from "./PainelProdutor.module.css";

/** Aviso do Meu painel quando o login não tem nome da planilha vinculado (spec 4.4). */
export const AVISO_SEM_VINCULO = "Seu login ainda não está ligado a um nome da planilha. Fale com o administrador.";

export function AvisoSemVinculo() {
  return <p className={s.aviso} role="status">{AVISO_SEM_VINCULO}</p>;
}

/**
 * Painel do produtor (spec 4.1–4.3) para os nomes dados. `mostrarDono` acrescenta o nome curto do
 * colaborador em cada item de "A renovar" (vários produtores). Todas as regras vêm de domain/painel-produtor.
 */
export function PainelProdutor({ nomes, mostrarDono, saudacao, prefixoTitulo = "Minha produção" }: {
  nomes: ReadonlySet<string>; mostrarDono: boolean; saudacao: string | null;
  /** Início dos títulos dos cartões: "Minha produção" (Meu painel) ou "Produção" (página Produtores). */
  prefixoTitulo?: "Minha produção" | "Produção";
}) {
  const { base } = usePainel();
  const hoje = base.hoje;
  return (
    <div className={s.painel}>
      <div className={s.topo}>
        {saudacao ? <b>{saudacao}</b> : <span />}
        <span>{nomeMes(mesDe(hoje), "titulo")} · dados até hoje, {hoje.slice(8, 10)}/{hoje.slice(5, 7)}</span>
      </div>
      <div className={s.grade}>
        <BlocoProducaoMes nomes={nomes} prefixoTitulo={prefixoTitulo} />
        <ListaRenovar nomes={nomes} mostrarDono={mostrarDono} />
      </div>
      <GraficoMesAMes nomes={nomes} prefixoTitulo={prefixoTitulo} />
    </div>
  );
}
