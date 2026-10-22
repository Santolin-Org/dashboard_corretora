"use client";
import { useEstadoAba } from "@/client/estadoAbas";
import { META_PCT_INICIAL, ORDEM_METAS_INICIAL, alternarOrdemMetas, type ChaveMetas, type OrdemMetas } from "@/domain/metas";
import { EQUIPE_SEMANAL_INICIAL, METRICA_SEMANAL_INICIAL, type EquipeMeta, type MetricaSemana } from "@/domain/metas-semanal";

export type VisaoMetas = "total" | "detalhe";

// Estado de UI da aba Metas. No antigo vivia em globais (metaSortKey/metaSortDir, metaWeekTeam/metaWeekMetric) e no
// DOM (#meta-novos-pct, #meta-renov-pct, rádios vt-metas) e sobrevivia à troca de aba. O "Limpar filtros" global não
// mexe em nada disso. Cada setter redesenha só o que o antigo redesenhava (aqui: o React recalcula o que depende).
export function useEstadoMetas() {
  const [novos, setNovos] = useEstadoAba<string>("metas:novos", META_PCT_INICIAL);
  const [renov, setRenov] = useEstadoAba<string>("metas:renov", META_PCT_INICIAL);
  const [equipe, setEquipe] = useEstadoAba<EquipeMeta>("metas:equipe", EQUIPE_SEMANAL_INICIAL);
  const [metrica, setMetrica] = useEstadoAba<MetricaSemana>("metas:metrica", METRICA_SEMANAL_INICIAL);
  const [ordem, setOrdem] = useEstadoAba<OrdemMetas>("metas:ordem", ORDEM_METAS_INICIAL);
  const [visao, setVisao] = useEstadoAba<VisaoMetas>("metas:visao", "total");
  return {
    novos, setNovos, renov, setRenov, equipe, metrica, ordem, visao, setVisao,
    // setMetaWeekCard: foca a equipe e a métrica do cartão clicado.
    setCartao(t: EquipeMeta, m: MetricaSemana) { setEquipe(t); setMetrica(m); },
    ordenar(chave: ChaveMetas) { setOrdem(alternarOrdemMetas(ordem, chave)); },
  };
}
export type EstadoMetas = ReturnType<typeof useEstadoMetas>;
