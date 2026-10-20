"use client";
import type { ReactNode } from "react";
import type { BaseCliente } from "@/client/useBase";
import s from "./TelaErro.module.css";

/** Mensagem do erro de produção com a listagem da pasta (que é o que resolve o caso comum:
 *  arquivo salvo com um nome que não casa com o padrão). Não repete a listagem quando a
 *  mensagem do servidor já a traz (mensagemSemProducao). */
export function textoErroProducao(e: NonNullable<BaseCliente["erroProducao"]>): string {
  const lista = e.arquivosNaPasta.length && !e.mensagem.includes("A pasta Dashboard contém")
    ? ` A pasta Dashboard contém: ${e.arquivosNaPasta.join(", ")}.` : "";
  return e.mensagem + lista;
}

/** Erro de produção no lugar do conteúdo de uma aba/tela que depende da produção. */
export function ErroProducao({ erro }: { erro: NonNullable<BaseCliente["erroProducao"]> }) {
  return <p className="sp-error" data-erro-producao="">{textoErroProducao(erro)}</p>;
}

// Substitui a tela de upload do app antigo (_spFallback): mostra o motivo em #sp-error e,
// no lugar do upload (removido), as ações possíveis — ver as fontes e tentar de novo.
export function TelaErro({ mensagem, acoes }: { mensagem: string; acoes?: ReactNode }) {
  return (
    <div className={s.tela}>
      <p id="sp-error" className="sp-error">{mensagem}</p>
      {acoes && <div className={s.acoes}>{acoes}</div>}
    </div>
  );
}

/** Equivale ao #progress-wrap enquanto /api/dados não responde. */
export function TelaCarregando() {
  return (
    <div className={s.tela}>
      <div className={s.progresso} id="progress-wrap">
        <p className={s.rotulo} id="progress-label">Processando...</p>
        <div className={s.barra}><div className={s.preenchimento} /></div>
        <p className={s.texto} id="progress-text">Processando planilhas...</p>
      </div>
    </div>
  );
}
