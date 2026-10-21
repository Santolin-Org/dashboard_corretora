"use client";
import { useEstadoAba } from "@/client/estadoAbas";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import {
  METRICA_COMP_INICIAL, periodoPadraoComp,
  type DimRank, type MetricaComp, type MetricaPivo, type MetricaRank, type PeriodoManual, type VisaoPivo,
} from "@/domain/comparativo";

// Estado de UI da aba Comparativo. No antigo vivia em globais (compStartDate/EndDate, compPeriodManual, compMetric,
// compPivotView, compPivotCollapsed, compRankDim/Metric) e no DOM (rádios de métrica do pivô); sobrevivia à troca de aba.
type PeriodoGuardado = { manual: PeriodoManual | null; geracao: number };

export function useEstadoComp() {
  const { base } = usePainel();
  const { geracaoLimpeza } = useFiltros();
  const [guardado, setGuardado] = useEstadoAba<PeriodoGuardado>("comparativo:periodo", { manual: null, geracao: 0 });
  const [linhasVistas, setLinhasVistas] = useEstadoAba<unknown>("comparativo:linhas", null);
  // resetFilters (Limpar filtros global): compPeriodManual = false e período descartado, valendo mesmo com a aba fechada.
  const manualBruto = guardado.geracao === geracaoLimpeza ? guardado.manual : null;
  // initDashboard (a cada carga de dados) regrava compStartDate/compEndDate com o default, mas NÃO desliga
  // compPeriodManual: com o período manual ativo, a aba passa a mostrar 1º/jan → hoje ainda marcada "definido na aba".
  const manual = manualBruto && linhasVistas !== null && linhasVistas !== base.linhas ? periodoPadraoComp(base.hoje) : manualBruto;
  if (linhasVistas !== base.linhas) queueMicrotask(() => {
    setLinhasVistas(base.linhas);
    if (manual !== manualBruto) setGuardado({ manual, geracao: geracaoLimpeza });
  });
  const [metrica, setMetrica] = useEstadoAba<MetricaComp>("comparativo:metrica", METRICA_COMP_INICIAL);
  const [visao, setVisao] = useEstadoAba<VisaoPivo>("comparativo:visao", "ambos");
  const [metricaPivo, setMetricaPivo] = useEstadoAba<MetricaPivo>("comparativo:metrica-pivo", "premio");
  const [recolhidas, setRecolhidas] = useEstadoAba<string[]>("comparativo:recolhidas", []);
  const [dim, setDim] = useEstadoAba<DimRank>("comparativo:dim", "colab");
  const [metricaRank, setMetricaRank] = useEstadoAba<MetricaRank>("comparativo:metrica-rank", "premio");
  return {
    manual, setManual: (m: PeriodoManual | null) => setGuardado({ manual: m, geracao: geracaoLimpeza }),
    metrica, setMetrica, visao, setVisao, metricaPivo, setMetricaPivo, recolhidas, setRecolhidas, dim, setDim, metricaRank, setMetricaRank,
  };
}
export type EstadoComp = ReturnType<typeof useEstadoComp>;
