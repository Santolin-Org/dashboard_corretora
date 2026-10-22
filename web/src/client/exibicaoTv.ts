// Abrir/fechar a Exibição TV. No antigo era um overlay sobre a aba ativa (openTvExibicao/closeTvExibicao); aqui é a rota
// /exibicao-tv: abrir guarda a aba de origem (sessionStorage) e fechar volta para ela, com os filtros (?f=) preservados.
const CHAVE = "tvVoltarPara";
const PADRAO = "/visao-geral"; // primeira aba do painel (abertura direta pela URL: não há aba anterior)

export function abrirExibicaoTv(ir: (href: string) => void): void {
  try { sessionStorage.setItem(CHAVE, window.location.pathname); } catch { /* sem storage: volta para a aba padrão */ }
  ir("/exibicao-tv" + window.location.search);
}

export function rotaDeVolta(): string {
  let rota: string | null = null;
  // Lida uma vez só: fechar a exibição consome a aba de origem (a próxima abertura grava de novo).
  try { rota = sessionStorage.getItem(CHAVE); sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ }
  // Só volta para uma aba do painel (nunca para a própria exibição nem para a apresentação).
  if (!rota || rota === "/exibicao-tv" || rota === "/apresentacao") rota = PADRAO;
  return rota + window.location.search;
}
