"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fN } from "@/domain/formatos";
import { fontesDesatualizadas } from "@/domain/producao/base";
import type { BaseCliente } from "@/client/useBase";
import { BotaoModoTv } from "./ModoTv";
import s from "./Cabecalho.module.css";

/** Texto de #rec-badge: updateDashHeader na carga; applyFilters/resetFilters depois. */
export function textoRecBadge(base: BaseCliente, recBadgeContagem: number, inicial: boolean): string {
  if (base.linhas.length > 0 || !inicial) return fN(recBadgeContagem) + " registros";
  if (base.sinistros.length > 0) return fN(base.sinistros.length) + " sinistros";
  return "—";
}

/** Conteúdo de #dash-subtitle (updateDashHeader, main.js 846–868). */
export function Subtitulo({ base, onAbrirFontes }: { base: BaseCliente; onAbrirFontes(): void }) {
  const partes: ReactNode[] = [];
  if (base.linhas.length > 0) {
    const n = base.manifesto.length;
    const aviso = fontesDesatualizadas(base.manifesto).length ? " ⚠️" : "";
    partes.push(
      <span key="prod">
        {"Produção: " + fN(base.linhas.length)}
        {n > 0 && (
          <>
            {" ("}
            <button
              type="button"
              className="src-link"
              onClick={onAbrirFontes}
              title={aviso ? "Há arquivo de produção desatualizado — clique para ver" : undefined}
            >
              {`${n} ${n === 1 ? "arquivo" : "arquivos"}${aviso}`}
            </button>
            {")"}
          </>
        )}
      </span>,
    );
  }
  if (base.sinistros.length > 0) {
    let sin = "Sinistros: " + fN(base.sinistros.length);
    const { sinistrosAvisados: av, sinistrosPagamentos: pg } = base.contagensSinistros;
    if (av || pg) sin += " (avisados " + fN(av) + " · pagos " + fN(pg) + ")";
    partes.push(<span key="sin">{sin}</span>);
  }
  if (!partes.length) return <>Nenhuma fonte carregada</>;
  return <>{partes.flatMap((p, i) => (i ? [" · ", p] : [p]))}</>;
}

export function Cabecalho({ base, recBadge, onAbrirFontes }: { base: BaseCliente; recBadge: string; onAbrirFontes(): void }) {
  const router = useRouter();
  return (
    <header className={s.cabecalho}>
      <div>
        <h1 className={s.titulo}>Dashboard de Produção</h1>
        <p id="dash-subtitle" className={s.subtitulo}><Subtitulo base={base} onAbrirFontes={onAbrirFontes} /></p>
      </div>
      <div className={`${s.acoes} topbar-actions`}>
        <span id="rec-badge" className={s.recBadge}>{recBadge}</span>
        <BotaoModoTv />
        <button type="button" className="btn-sm" onClick={() => router.push("/exibicao-tv" + window.location.search)} title="Abrir exibição em tela cheia para TV">
          📺 Exibição TV
        </button>
        {/* exportExecutiveSummary ainda não tem tarefa de porte: o botão fica visível e inerte. */}
        <button
          type="button"
          className="btn-sm"
          style={{ borderColor: "#1D9E75", color: "#1D9E75", fontWeight: 600 }}
          title="Em migração"
          aria-disabled="true"
        >
          Exportar Resumo
        </button>
      </div>
    </header>
  );
}
