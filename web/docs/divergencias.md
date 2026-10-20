# Divergências e peculiaridades (decisão do Mitz)

## Task 3 — domínio base

- **`#rec-badge` mostra "0 registros" na carga inicial no app antigo.** `updateDashHeader`
  roda antes de `FD` ser preenchido (main.js:935/937). O app novo reproduz isso de propósito,
  para paridade. Decidir se vira correção depois da migração.

## Task 10 — casca do app

- **FD na carga inicial e depois de "Limpar filtros" é a base inteira (`ALL`)**, sem passar por
  `applyFilters`: inclui as faturas de saúde (`saudeFaturaDe`) que `applyFilters` sem tipo
  marcado descarta (initDashboard/resetFilters). O app novo reproduz (`useFiltros().fd`).
- **Botão "Exportar Resumo"**: ficou inerte até a Task 15, que o portou (ver "Task 15 — Produção").
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
- **Filtro de motivos de cancelamento** volta a "todos" quando o FD muda (applyFilters) e a cada
  "Limpar filtros" (resetFilters), mesmo com o FD igual: resolvido na Task 15 com
  `geracaoLimpeza` (filtros provider) e `useEstadoAba`.

## Task 15 — Produção

- **Estado de UI das abas na store da casca** (`useEstadoAba`, em memória, sem localStorage):
  rádios, ordenação, períodos e seleção de motivos sobrevivem à troca de aba, como o DOM/globais
  do antigo, e voltam ao padrão ao recarregar a página.
- **"Limpar filtros" zera só o que o `resetFilters` zera**: seleção de motivos de cancelamento
  (`activeCancelMotivos`) e, nas abas seguintes, o período do Comparativo. Os **períodos da Produção
  (`periods`) NÃO são zerados** (só `initDashboard` os zera, ao carregar os dados). Reproduzido.
- **Rótulos em português quebrado reproduzidos**: "Colaboradors ativos" (rótulo + "s") e
  "5 colaboradors" no selo da tabela; "Grupo de produçãos ativos".
- **O KPI "Destaque" corta o nome só em " - "** (a tabela corta também em "|"). Reproduzido.
- **Período do gráfico usa `ALL` inteiro** (sem os filtros globais) e descarta faturas de saúde;
  o mês vem da data local (`vigLocal`), como na Visão geral.
- **Gráfico com a seção recolhida**: o antigo não redesenha `ch-prod-line` nem `#period-legend`
  enquanto `sectionState.chart` está fechado; no novo o gráfico segue atualizado (invisível).
- **Exportar Resumo** (`exportExecutiveSummary`) portado: "hasProducaoData" é `ALL.length > 0`,
  então com FD vazio gera planilhas vazias, igual ao antigo. A ordem das colunas da `Base_Filtrada`
  segue a ordem de criação das linhas do antigo (`linhaExportada`).
- **CSS**: `.prod-table/.ret-table`, `.bar-bg/.bar-fg` e `.rank-badge` entraram como CSS
  **global** (`src/styles/tabelas.css`, importado no layout raiz) porque Retenção, Metas e a
  Exibição TV compartilham os seletores. O seletor de períodos ficou em `Producao.module.css`.

## Task 16 — Retenção & Churn

- **Filtros próprios, independentes dos globais.** A aba lê `ALL` inteiro (`base.linhas`): vigência, emissão,
  colaborador, tipo etc. do cabeçalho não mudam nada nela, e o inverso também. O estado (`RET_MS`,
  `retActiveTipos`, `retSoEvitavel`, período, visão, ordenação, filtro de situação do detalhe) fica na
  store da casca e sobrevive à troca de aba; só "↻ Limpar" da própria aba o reinicia (período, seletores,
  tipos e "Só evitável"; **não** reinicia ordenação nem o filtro Todas/Canceladas/Vencidas, como o
  `resetRetFilters`). O período padrão (1º/jan–hoje) só é aplicado ao carregar e no Limpar da aba.
- **Quirk reproduzido: o "Limpar filtros" global tira o destaque dos botões da aba.** `resetFilters`
  faz `querySelectorAll('.tipo-btn').forEach(remove 'active')`, e "R — Renovação", "N — Novo" e
  "Só evitável" também são `.tipo-btn`. O filtro em si não muda (continua só evitável, tipos
  marcados), mas os botões ficam com aparência de desligados. Reclicar R com R no estado o remove do
  filtro (o antigo decide por `retActiveTipos.has`), e "Só evitável" volta a refletir o estado ao ser
  clicado. Reproduzido com `geracaoLimpeza` (vale mesmo com a aba fechada).
- **Rótulos em português quebrado reproduzidos:** selo da tabela por produtor "5 colaboradors" (rótulo + "s")
  e "N grupos"; selo de "Todas / Canceladas / Vencidas" fica como no HTML.
- **`retencao-detalhe-busca`:** o detalhe não tem busca por texto. `retDetailFilter` é o filtro de situação
  (Todas/Canceladas/Vencidas); o cenário clica em "Canceladas" (há também `retencao-detalhe-vencidas`).
- **Seção de gráficos recolhida:** o antigo não redesenha `ch-ret-cancel`/`ch-ret-evolucao` nem atualiza
  `#ret-cancel-badge` enquanto `sectionState['ret-charts']` está fechado; no novo seguem atualizados (invisíveis).
- **Gráfico por motivo vazio:** sem cancelamentos o antigo destrói o gráfico e deixa o `<canvas>` vazio;
  no novo o canvas fica sem `Chart` e `window.__charts['ch-ret-cancel']` não existe (igual ao `charts[...]`).
- **"Hoje" do período padrão:** o antigo usa `fmtD(today())` (data UTC do relógio do navegador) como fim do
  período; o novo usa `base.hoje` (data civil de São Paulo). Só diferem entre 21h e 24h (horário de Brasília).
- **Página do detalhe:** `retDetailPage` volta a 1 a cada `renderRetTab`: qualquer ação de filtro (inclusive
  desligar e religar), período, visão, Todas/Canceladas/Vencidas (mesmo o já ativo), "↻ Limpar" (mesmo nos
  padrões) e ao voltar à aba. Reproduzido com uma geração de render incrementada por essas ações. Ordenar a
  tabela por produtor não reinicia. Não reproduzido: a troca de tema (que também chama `renderRetTab`).
- **Recarga de dados:** as opções de colaborador são remontadas com os marcados atuais (`populateFilters`).
- **Exportar** (`exportData('churn')` e `('detalhe')`): arquivos `Export_Churn.xlsx` (aba "Churn", usa a visão
  marcada, a ordem de criação do agregado e não a ordenação da tela) e `Export_Detalhe.xlsx` (aba "Detalhe",
  todas as perdidas no filtro de situação atual, sem paginar). Comparados célula a célula com o antigo em
  `tests/parity/exportar-retencao.test.ts`.
