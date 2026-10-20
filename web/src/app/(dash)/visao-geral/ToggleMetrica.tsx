"use client";
import type { Metrica } from "@/domain/visao-geral";

// <div class="metric-toggle"> com dois rádios (name=<nome>, ids <nome>-p / <nome>-c), como no index.html.
export function ToggleMetrica({ nome, valor, aoMudar }: { nome: string; valor: Metrica; aoMudar(m: Metrica): void }) {
  return (
    <div className="metric-toggle">
      <input type="radio" name={nome} id={`${nome}-p`} value="premio" checked={valor === "premio"} onChange={() => aoMudar("premio")} />
      {" "}
      <label htmlFor={`${nome}-p`}>Prêmio</label>
      {" "}
      <input type="radio" name={nome} id={`${nome}-c`} value="comissao" checked={valor === "comissao"} onChange={() => aoMudar("comissao")} />
      {" "}
      <label htmlFor={`${nome}-c`}>Comissão</label>
    </div>
  );
}
