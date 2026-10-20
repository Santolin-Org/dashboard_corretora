# Divergências e peculiaridades (decisão do Mitz)

## Task 3 — domínio base

- **`#rec-badge` mostra "0 registros" na carga inicial no app antigo.** `updateDashHeader`
  roda antes de `FD` ser preenchido (main.js:935/937). O app novo reproduz isso de propósito,
  para paridade. Decidir se vira correção depois da migração.

## Task 10 — casca do app

- **FD na carga inicial e depois de "Limpar filtros" é a base inteira (`ALL`)**, sem passar por
  `applyFilters`: inclui as faturas de saúde (`saudeFaturaDe`) que `applyFilters` sem tipo
  marcado descarta (initDashboard/resetFilters). O app novo reproduz (`useFiltros().fd`).
- **Botão "Exportar Resumo"** aparece no cabeçalho, mas fica inerte (`aria-disabled`, título
  "Em migração"): `exportExecutiveSummary` não tem tarefa de porte no plano. Decidir se porta ou remove.
- **"Novo relatório" (upload) foi removido** do cabeçalho, como manda a regra de não haver upload.
  Por isso os botões da direita do cabeçalho ficam deslocados à direita em relação ao antigo.
- **O botão −/+ das seções recolhíveis não faz nada no app antigo** (fica dentro de
  `.section-controls`, que dá `stopPropagation`); só o clique no cabeçalho alterna. Reproduzido.
- **Filtros na URL (`?f=`)**: novidade. Os filtros globais acompanham a navegação entre abas e
  sobrevivem ao recarregar a página (o antigo perdia tudo no reload).

## Task 14 — Visão geral

- **Ano/mês pela data LOCAL do Date, não pela fatia UTC do `fmtD`.** O app antigo agrupa a
  evolução mensal e o filtro "ano corrente" dos KPIs com `getFullYear()/getMonth()`. Numa célula
  numérica sem formato de data, o `toDate` antigo faz o serial virar meia-noite UTC, que em São
  Paulo é o dia anterior às 21h: uma apólice com início em 01/02 cai em janeiro no gráfico (e uma
  de 01/01 cai no ano anterior), enquanto o `fmtD` e os filtros de data a veem em 01/02. É bug do
  antigo; foi **reproduzido**: `Linha.vigLocal`/`emLocal` (preenchidos só quando diferem da ISO,
  pelo `parseProducao`, que agora lê o formato da célula) alimentam `evolucaoMensal`/`cartoesKpi`.
  Planilhas reais com colunas de data formatadas como data não disparam o efeito; a fixture
  alterna células Date e numéricas de propósito. As demais abas que usam `getFullYear/getMonth`
  (Comparativo, Metas…) devem usar o mesmo `vigLocal`. `prodYearRange` (Task 3) usa a ISO, não
  a data local: só difere em 01/01 de célula numérica; não alterado aqui.
- **Filtro de motivos de cancelamento volta a "todos" só quando o FD muda de identidade.** No
  antigo também volta em "Limpar filtros" sem nenhum filtro ativo (FD igual); no novo, nesse caso
  a seleção permanece.
