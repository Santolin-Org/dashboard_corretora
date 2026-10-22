"use client";
import { useEffect, useRef, useState } from "react";
import { PAINEIS_TV } from "@/domain/paineis-tv";
import { escolherPainelTv, usePainelTv } from "@/client/painelTv";
import s from "./SeletorPainelTv.module.css";

/** Some depois deste tempo sem mexer o mouse/teclado (a TV parada nunca mostra o seletor). */
export const SELETOR_TV_OCULTA_MS = 3000;

// Seletor do painel da Exibição TV. Fica FORA do #tv-exibicao (fixo, acima do overlay): o conteúdo da
// exibição continua idêntico ao do app antigo para a régua de paridade. Aparece ao mexer o mouse ou usar
// o teclado e some sozinho — não cobre o selo do cartão de baixo na TV.
export function SeletorPainelTv() {
  const painel = usePainelTv();
  const [visivel, setVisivel] = useState(false);
  const preso = useRef(false); // mouse em cima ou foco no select: não some
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mostrar = () => {
      setVisivel(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (!preso.current) setVisivel(false); }, SELETOR_TV_OCULTA_MS);
    };
    window.addEventListener("mousemove", mostrar);
    window.addEventListener("keydown", mostrar);
    return () => {
      window.removeEventListener("mousemove", mostrar);
      window.removeEventListener("keydown", mostrar);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const prender = (v: boolean) => { preso.current = v; if (v) setVisivel(true); };
  return (
    <label
      className={`${s.seletor}${visivel ? ` ${s.visivel}` : ""}`}
      data-visivel={visivel}
      onMouseEnter={() => prender(true)}
      onMouseLeave={() => prender(false)}
      onFocus={() => prender(true)}
      onBlur={() => prender(false)}
    >
      <span className={s.rotulo}>Painel</span>
      <select
        id="tv-painel"
        className={s.campo}
        value={painel.id}
        onChange={(e) => escolherPainelTv(e.target.value)}
        aria-label="Painel exibido na TV"
      >
        {PAINEIS_TV.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.nome}</option>)}
      </select>
    </label>
  );
}
