"use client";
import type { ReactNode } from "react";
import s from "./TelaErro.module.css";

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
