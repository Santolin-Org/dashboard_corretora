"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fN } from "@/domain/formatos";
import { resumoExecutivo, type Visao } from "@/domain/producao-aba";
import type { Metrica } from "@/domain/visao-geral";
import { useFiltros } from "@/client/filtros";
import { useEstadoAba } from "@/client/estadoAbas";
import { baixarPlanilha } from "@/client/exportar";
import { fontesDesatualizadas } from "@/domain/producao/base";
import type { BaseCliente } from "@/client/useBase";
import { BotaoModoTv } from "./ModoTv";
import { MenuExibicaoTv } from "./MenuExibicaoTv";
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
  const { fd } = useFiltros();
  // Mesmos controles da aba Produção (a store é da casca): o resumo usa a visão e a métrica marcadas lá.
  const [visao] = useEstadoAba<Visao>("producao:visao", "colab");
  const [metricaTabela] = useEstadoAba<Metrica>("producao:mt-tbl", "comissao");
  // exportExecutiveSummary: hasProducaoData() é ALL.length > 0 (com o FD vazio exporta planilhas vazias).
  const exportarResumo = () => {
    if (base.linhas.length === 0) { alert("Sem dados de produção para exportar."); return; }
    const r = resumoExecutivo(fd, visao, metricaTabela);
    void baixarPlanilha("Resumo_Executivo.xlsx", [{ nome: "Base_Filtrada", linhas: r.baseFiltrada }, { nome: "Producao_Por_Agente", linhas: r.producaoPorAgente }]);
  };
  return (
    <header className={s.cabecalho}>
      <div>
        <h1 className={s.titulo}>Dashboard de Produção</h1>
        <p id="dash-subtitle" className={s.subtitulo}><Subtitulo base={base} onAbrirFontes={onAbrirFontes} /></p>
      </div>
      <div className={`${s.acoes} topbar-actions`}>
        <span id="rec-badge" className={s.recBadge}>{recBadge}</span>
        <BotaoModoTv />
        <MenuExibicaoTv temDados={base.linhas.length > 0} ir={router.push} />
        <button
          type="button"
          className="btn-sm"
          style={{ borderColor: "#1D9E75", color: "#1D9E75", fontWeight: 600 }}
          onClick={exportarResumo}
        >
          Exportar Resumo
        </button>
      </div>
    </header>
  );
}
