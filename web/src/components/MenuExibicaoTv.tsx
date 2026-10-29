"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PAINEIS_TV } from "@/domain/paineis-tv";
import { escolherPainelTv, usePainelTv } from "@/client/painelTv";
import { abrirExibicaoTv } from "@/client/exibicaoTv";
import s from "./MenuExibicaoTv.module.css";

// Botão "📺 Exibição TV" do cabeçalho: abre a lista de painéis e a escolha abre a exibição já nele.
// O painel só se escolhe ANTES de abrir — a tela da TV não tem seletor. A escolha fica salva no aparelho.
// A barra lateral usa o mesmo menu com outros ids (sem repetir os do cabeçalho) e o visual dela.
export function MenuExibicaoTv({ temDados, ir, prefixoId = "", classeBotao = "btn-sm", classeMenu, classeLista, rotulo = "📺 Exibição TV" }: {
  temDados: boolean; ir: (href: string) => void;
  prefixoId?: string; classeBotao?: string; classeMenu?: string; classeLista?: string; rotulo?: ReactNode;
}) {
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
    <div className={classeMenu ? `${s.menu} ${classeMenu}` : s.menu} ref={raiz}>
      <button
        type="button"
        id={`${prefixoId}tv-ex-abrir`}
        className={classeBotao}
        onClick={alternar}
        title="Abrir exibição em tela cheia para TV"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        {rotulo}
      </button>
      {aberto && (
        <div id={`${prefixoId}tv-painel-menu`} className={classeLista ? `${s.lista} ${classeLista}` : s.lista} role="menu" aria-label="Escolha o painel da TV">
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
