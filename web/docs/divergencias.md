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
