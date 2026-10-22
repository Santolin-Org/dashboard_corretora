"use client";
import { useEffect, useRef, useState } from "react";
import { PAINEIS_TV } from "@/domain/paineis-tv";
import { escolherPainelTv, usePainelTv } from "@/client/painelTv";
import { abrirExibicaoTv } from "@/client/exibicaoTv";
import s from "./MenuExibicaoTv.module.css";

// Botão "📺 Exibição TV" do cabeçalho: abre a lista de painéis e a escolha abre a exibição já nele.
// O painel só se escolhe ANTES de abrir — a tela da TV não tem seletor. A escolha fica salva no aparelho.
export function MenuExibicaoTv({ temDados, ir }: { temDados: boolean; ir: (href: string) => void }) {
  const atual = usePainelTv();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const alternar = () => {
    // openTvExibicao: sem dados, avisa e não abre.
    if (!temDados) { alert("Carregue os dados antes de abrir a exibição."); return; }
    setAberto((v) => !v);
  };
  const abrir = (id: string) => {
    escolherPainelTv(id);
    setAberto(false);
    abrirExibicaoTv(ir);
  };

  return (
    <div className={s.menu} ref={raiz}>
      <button
        type="button"
        id="tv-ex-abrir"
        className="btn-sm"
        onClick={alternar}
        title="Abrir exibição em tela cheia para TV"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        📺 Exibição TV
      </button>
      {aberto && (
        <div id="tv-painel-menu" className={s.lista} role="menu" aria-label="Escolha o painel da TV">
          <div className={s.titulo}>Painel da TV</div>
          {PAINEIS_TV.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className={`${s.item}${p.id === atual.id ? ` ${s.atual}` : ""}`}
              data-painel={p.id}
              aria-current={p.id === atual.id ? "true" : undefined}
              onClick={() => abrir(p.id)}
            >
              <span className={s.id}>{p.id}</span>
              <span className={s.nome}>{p.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
