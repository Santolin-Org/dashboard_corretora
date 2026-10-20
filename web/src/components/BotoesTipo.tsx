"use client";
import { TIPO_LABELS } from "@/domain/filtros";
import s from "./BotoesTipo.module.css";

// buildTipoBtns/toggleTipo (main.js): <div id="tipo-btns"> com <button class="tipo-btn" data-tipo="N">.
export function BotoesTipo({ tipos, ativos, onChange }: { tipos: string[]; ativos: string[]; onChange(novos: string[]): void }) {
  return (
    <div className={`${s.tipoBtns} tipo-btns`} id="tipo-btns">
      {tipos.map((t) => {
        const ativo = ativos.includes(t);
        return (
          <button
            key={t}
            type="button"
            className={`${s.tipoBtn} tipo-btn${ativo ? " active" : ""}`}
            data-tipo={t}
            onClick={() => onChange(ativo ? ativos.filter((x) => x !== t) : [...ativos, t])}
          >
            {TIPO_LABELS[t] || t}
          </button>
        );
      })}
    </div>
  );
}
