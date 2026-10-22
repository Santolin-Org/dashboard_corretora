"use client";
import type { DadosChooser } from "@/domain/apresentacao";

/** kfShowChooser: Fechamento de mês ou uma semana específica (ou a mensagem, sem as duas pontas da vigência). */
export function Chooser({ dados, aoIniciar }: { dados: DadosChooser; aoIniciar: (modo: "fechamento" | "semana", semana?: number) => void }) {
  if (dados.semPeriodo) {
    return <div className="kf-choose"><div className="kf-choose-title">Selecione um período de vigência na aba Metas para gerar a apresentação.</div></div>;
  }
  const { mesNome, ano, prev, semanas } = dados;
  return (
    <div className="kf-choose">
      <div className="kf-choose-eyebrow">Modo apresentação</div>
      {" "}
      <div className="kf-choose-title">{mesNome} de {ano}</div>
      {" "}
      <div className="kf-choose-grid">
        <button type="button" className="kf-choose-card kf-choose-main" onClick={() => aoIniciar("fechamento")}>
          <div className="kf-choose-h">Fechamento de mês</div>
          {" "}
          <div className="kf-choose-d">Consolida os resultados de <b>{prev.mesNome}</b>, mostra a evolução semana a semana vs. o esperado e apresenta a meta de {mesNome}.</div>
          {" "}
          <div className="kf-choose-go">Gerar ›</div>
        </button>
        {" "}
        <div className="kf-choose-card">
          <div className="kf-choose-h">Resultado por semana</div>
          {" "}
          <div className="kf-choose-d">Escolha uma semana de {mesNome}:</div>
          {" "}
          <div className="kf-wk-grid">
            {semanas.map((w) => (
              <button key={w.idx} type="button" className="kf-wk-btn" onClick={() => aoIniciar("semana", w.idx)}><b>{w.label}</b><span>{w.periodoLabel}</span></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
