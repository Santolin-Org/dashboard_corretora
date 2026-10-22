"use client";
import { TIPO_LABELS } from "@/domain/filtros";
import s from "./BotoesTipo.module.css";

// buildTipoBtns/toggleTipo (main.js): <div id="tipo-btns"> com <button class="tipo-btn" data-tipo="N">.
// Visual de controle segmentado: só o código no botão (cabe numa linha da barra de filtros);
// o nome completo fica no tooltip e no rótulo acessível.
export function BotoesTipo({ tipos, ativos, onChange }: { tipos: string[]; ativos: string[]; onChange(novos: string[]): void }) {
  return (
    <div className={`${s.segmentado} tipo-btns`} id="tipo-btns" role="group" aria-label="Tipo de documento">
      {tipos.map((t) => {
        const ativo = ativos.includes(t);
        const nome = TIPO_LABELS[t] || t;
        return (
          <button
            key={t}
            type="button"
            className={`${s.segmento} tipo-btn${ativo ? " active" : ""}`}
            data-tipo={t}
            title={nome}
            aria-label={nome}
            aria-pressed={ativo}
            onClick={() => onChange(ativo ? ativos.filter((x) => x !== t) : [...ativos, t])}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
