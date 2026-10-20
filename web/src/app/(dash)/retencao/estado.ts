"use client";
import { useEstadoAba } from "@/client/estadoAbas";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import {
  FILTROS_RET_INICIAIS, ORDEM_RET_INICIAL, periodoPadraoRet,
  type FiltroDetalhe, type FiltrosRetencao, type OrdemRet, type PeriodoRet, type VisaoRet,
} from "@/domain/retencao";

// Estado de UI da aba Retenção. No app antigo vivia em globais (RET_MS, retActiveTipos, retSoEvitavel,
// retDetailFilter, retSortKey/Dir) e no DOM (#ret-per-s/e, rádio vt-ret), e sobrevivia à troca de aba:
// aqui fica na store da casca (useEstadoAba). Os filtros próprios são independentes dos globais.

/** Aparência dos botões R, N e "Só evitável" (classe `active`). Normalmente espelha o filtro, mas o
 *  `resetFilters` global tira `active` de TODO `.tipo-btn` (inclusive estes) sem mexer no filtro. */
export type VisualBotoes = { R: boolean; N: boolean; evitavel: boolean };
export const VISUAL_INICIAL: VisualBotoes = { R: false, N: false, evitavel: true };
const VISUAL_LIMPO: VisualBotoes = { R: false, N: false, evitavel: false };

export function useEstadoRetencao() {
  const { base } = usePainel();
  const { geracaoLimpeza } = useFiltros();
  const [filtros, setFiltros] = useEstadoAba<FiltrosRetencao>("retencao:filtros", FILTROS_RET_INICIAIS);
  const [periodo, setPeriodo] = useEstadoAba<PeriodoRet>("retencao:periodo", periodoPadraoRet(base.hoje));
  const [colRemontagem, setColRemontagem] = useEstadoAba<string[]>("retencao:col-remontagem", []);
  const [visual, setVisual] = useEstadoAba<VisualBotoes>("retencao:visual", VISUAL_INICIAL);
  const [geracaoVista, setGeracaoVista] = useEstadoAba<number>("retencao:geracao", 0);
  const [visao, setVisao] = useEstadoAba<VisaoRet>("retencao:visao", "colab"); // vt-ret-colab marcado de início
  const [ordem, setOrdem] = useEstadoAba<OrdemRet>("retencao:ordem", ORDEM_RET_INICIAL);
  const [situacao, setSituacao] = useEstadoAba<FiltroDetalhe>("retencao:detalhe", "");
  // Limpar filtros (global): zera a aparência dos botões; vale mesmo com a aba fechada.
  const visualAtual = geracaoVista === geracaoLimpeza ? visual : VISUAL_LIMPO;
  return {
    filtros, setFiltros, periodo, setPeriodo, colRemontagem, setColRemontagem, visual: visualAtual, setVisual,
    geracaoLimpeza, geracaoVista, setGeracaoVista, visao, setVisao, ordem, setOrdem, situacao, setSituacao,
    /** Confirma na store o visual limpo pelo "Limpar filtros" global. */
    sincronizarGeracao() { if (geracaoVista !== geracaoLimpeza) { setVisual(VISUAL_LIMPO); setGeracaoVista(geracaoLimpeza); } },
  };
}
