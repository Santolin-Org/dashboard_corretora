// Painéis da Exibição TV: cada um é uma campanha (período + barras de meta). A TV mostra o
// painel escolhido no seletor (salvo no aparelho). Para criar um painel novo, acrescente
// uma entrada aqui — o resto da tela (meta mensal de novos, carteira por ano, níveis) é o mesmo.
import { CAMPANHA_360_FASES_COM, CAMPANHA_360_FASES_QTD, CAMPANHA_360_FIM, CAMPANHA_360_INICIO } from './crosssell';
import type { DataISO } from './tipos';

/** `com`: comissão gerada (R$) — "Resultado Gerado"; `qtd`: apólices — "Negócios Realizados". */
export type MetaPainel = { tipo: 'com' | 'qtd'; fases: number[] };
/** `podios`: rankings Top 3 mostrados, na ordem; `fotos`: foto do colaborador em cada degrau do pódio. */
export type PainelTv = { id: string; nome: string; inicio: DataISO; fim: DataISO; metas: MetaPainel[]; podios: ('qtd' | 'com')[]; fotos: boolean };

export const PAINEIS_TV: PainelTv[] = [
  {
    id: '360_tri3', nome: 'Santolin 360 — 3º tri/2026',
    inicio: CAMPANHA_360_INICIO, fim: CAMPANHA_360_FIM,
    metas: [{ tipo: 'com', fases: CAMPANHA_360_FASES_COM }, { tipo: 'qtd', fases: CAMPANHA_360_FASES_QTD }],
    podios: ['qtd', 'com'], fotos: false,
  },
  {
    id: '360_tri4', nome: 'Santolin 360 — 4º tri/2026',
    inicio: '2026-10-01', fim: '2026-12-31',
    metas: [{ tipo: 'com', fases: [100000, 120000, 130000] }],
    podios: ['com'], fotos: true,
  },
];

export const PAINEL_TV_PADRAO = '360_tri4';

/** Painel pelo id; id desconhecido/vazio → o padrão. */
export function painelTv(id: string | null | undefined): PainelTv {
  return PAINEIS_TV.find((p) => p.id === id) ?? PAINEIS_TV.find((p) => p.id === PAINEL_TV_PADRAO)!;
}
