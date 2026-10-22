/** Instante atual (ms). Isolado aqui para o domínio continuar puro: ele recebe o valor por parâmetro (Cross-sell: Date.now() do antigo). */
export const agoraMs = (): number => Date.now();
