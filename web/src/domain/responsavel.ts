// Responsável efetivo e tipo efetivo de uma linha, com as marcas da atribuição de renovações (domain/atribuicoes.ts).
// Módulo à parte para renovacoes.ts/metas.ts/comparativo.ts lerem sem import circular com atribuicoes.ts.
import type { Linha } from './tipos';

export const respDe = (r: Pick<Linha, 'colab' | 'resp'>): string => r.resp ?? r.colab;
export const tipoMetaDe = (r: Pick<Linha, 'tipo' | 'tipoEfetivo'>): string => r.tipoEfetivo ?? r.tipo;
