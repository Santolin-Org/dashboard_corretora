"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { cartoesKpi } from "@/domain/visao-geral";
import { Kpi } from "@/components/Kpi";

// renderKPIs: <div class="kpi-grid" id="kpi-grid">.
export function BlocoKpis({ fd, hoje, semFiltroDeData }: { fd: Linha[]; hoje: string; semFiltroDeData: boolean }) {
  const cartoes = useMemo(() => cartoesKpi(fd, hoje, semFiltroDeData), [fd, hoje, semFiltroDeData]);
  return (
    <div className="kpi-grid" id="kpi-grid">
      {cartoes.map((k) => <Kpi key={k.rotulo} cor={k.cor} rotulo={k.rotulo} valor={k.valor} sub={k.sub} />)}
    </div>
  );
}
