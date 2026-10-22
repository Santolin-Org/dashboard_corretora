"use client";
import { useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { cartoesProducao, type Visao } from "@/domain/producao-aba";
import { Kpi } from "@/components/Kpi";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";

// renderProdKPIs: #sc-kpis com #prod-kpi-badge e #prod-kpi-grid.
export function BlocoKpis({ fd, visao }: { fd: Linha[]; visao: Visao }) {
  const k = useMemo(() => cartoesProducao(fd, visao), [fd, visao]);
  return (
    <SecaoRecolhivel chave="kpis" cabecalho={<SecaoTitulo>Indicadores principais{" "}<SecaoBadge id="prod-kpi-badge">{k.rotuloVisao}</SecaoBadge></SecaoTitulo>}>
      <div style={{ padding: 16 }}>
        <div className="kpi-grid" id="prod-kpi-grid">
          {k.cartoes.map((c) => <Kpi key={c.rotulo} cor={c.cor} rotulo={c.rotulo} valor={c.valor} sub={c.sub} estiloValor={{ fontSize: c.fonte }} />)}
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
