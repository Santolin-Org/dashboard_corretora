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

## Task 17 — Cross-sell

- **A aba lê `ALL` inteiro** (`base.linhas`): os filtros globais do cabeçalho não mudam nada nela (o subtítulo "no total (PF+PJ)" e
  as listas de ramo/colaborador também usam a base toda). Estado próprio (pessoa, ramo, colaborador, busca, ordenação, página, modo
  penetração/oportunidade) na store da casca, sobrevive à troca de aba; "Limpar filtros" global não mexe nele (só `initDashboard` zera, ao carregar).
- **Quirk reproduzido: a busca só redesenha a tabela.** `onCrossSearch` chama só `renderCrossTable`; KPIs, penetração e "Clientes por nível"
  ficam com a lista de antes da busca (o cenário `crosssell-busca` mostra "53 clientes" nos KPIs e "7 clientes" na tabela). Voltam a bater
  quando algo chama `renderCrossTab` (trocar a pessoa, marcar ramo/colaborador, "↻ Limpar", voltar à aba). `setCrossPenMode` redesenha só a
  penetração, e com a busca de agora. Reproduzido com `buscaKpi`/`buscaPen` em `crosssell/estado.ts`.
- **Quirk reproduzido: trocar a pessoa NÃO limpa a busca** (limpa ramo e colaborador e remarca os ramos principais da pessoa). "↻ Limpar" limpa
  ramo, colaborador e busca, mas **não remarca** os ramos principais (fica "Todos", universo inteiro) e não volta a pessoa para PF.
- **Paginação:** `crossPage` volta a 1 na busca, na troca de pessoa, ao marcar/desmarcar ramo ou colaborador e no "↻ Limpar"; ordenar e mudar o
  modo de penetração NÃO zeram; voltar à aba não zera. Reproduzido por evento (`estado.ts`).
- **Tempo e LTV usam `Date.now()` do antigo**: `anos = (agora − 1ª vigência) / 365,25 dias` e `ltv` só com `anos > 1`. O domínio recebe `agora`
  por parâmetro (`client/agora.ts` na UI). A 1ª vigência é o instante exato do `Date` do antigo: nova coluna opcional `Linha.vigMs`, preenchida por
  `parseProducao` (`celulaParaMs`), reproduz o `numdate` do SheetJS 0.18.5 no navegador (serial + 3h, com a correção de horário de verão antigo).
  Linhas sem `vigMs` (saúde criada à parte) caem na meia-noite de São Paulo da data ISO. Detalhe de fixture: o SheetJS do Node grava as datas ISO
  da fixture 28 s abaixo do serial exato; `numdateSheetJS` devolve esses casos ao minuto redondo para bater com o antigo (no Excel real as células
  são de minuto redondo, então o ajuste não age).
- **Fixture:** a fixture não tinha apólices SANTOLIN 360 no 3º trimestre (metas e pódios ficavam zerados). `make-fixture.ts` marca, sem consumir o
  `rnd`, as apólices do trimestre; só mudaram os dourados `crosssell-*` e `exibicao-tv-padrao`. Os dourados das outras abas ficaram idênticos.
  O fuso de geração da fixture nos testes de domínio (`tests/domain/fixture.ts`) é fixado em São Paulo, porque o SheetJS grava `Date` pelo fuso do processo.
- **Ids de checkbox duplicados:** os seletores de ramo/colaborador da aba usam as chaves `ram`/`col` como os globais, então os checkboxes `ms-ram-…`
  e `ms-col-…` existem duas vezes no DOM (cabeçalho e aba), como no antigo. Reproduzido.
- **Campanha 360 é fixa** (CAMPANHA_360_INICIO/FIM = 2026-07-01..2026-09-30, fases 120/150/180 e R$ 77/97/115 mil): depois do trimestre as
  metas ficam zeradas. Independe dos filtros da aba. Nada mudou.
- **Ordenação por LTV** com dois clientes sem LTV: o comparador do antigo devolve `NaN` (`-Infinity - -Infinity`), tratado como empate (ordem de
  origem). Reproduzido sem alterar.
- **Harness:** `crosssell-busca` precisou do passo novo `digitar` (define o valor e dispara `input`), porque o campo de busca usa `oninput` e o passo
  `preencher` só dispara `change`.
- **CSS:** `.tier-goal*`/`.podium*` entraram como CSS **global** (`src/styles/campanha.css`) porque a Exibição TV (Task 22) reutiliza os seletores;
  `.pen-*` e o cartão de filtros ficaram em `Crosssell.module.css`.

## Task 18 — Comparativo de períodos

- **Fontes de dados:** gráfico, KPIs e ranking leem `ALL` (`base.linhas`) com os filtros globais (`matchesCompScope`: colaborador, grupo, ramo,
  seguradora, tipo, emissão; a vigência global só entra como período). O pivô seguradora/ramo lê `FD` (já filtrado, inclusive pela vigência global);
  no modo inicial/limpo (FD = ALL) inclui as faturas de saúde que um filtro de tipo descartaria — igual ao antigo.
- **Período:** manual da aba > vigência global (ambas as pontas) > 1º de janeiro do ano de `hoje` até `hoje`. Como na Retenção, o antigo usa
  `fmtD(today())` (data UTC); o novo usa `base.hoje` (data civil de São Paulo). Só diferem entre 21h e 24h.
- **Quirk reproduzido: `comp-start`/`comp-end`** são reescritos a cada render da aba com o período calculado; digitar neles só vale ao clicar
  "Comparar". O rascunho some a cada render (filtro global, métrica do gráfico, Comparar, Seguir filtro global, voltar à aba).
- **Quirk reproduzido: "Limpar filtros" global** descarta o período manual (`resetFilters`), mesmo com a aba fechada (via `geracaoLimpeza`).
- **Quirk reproduzido: recarga de dados** (`initDashboard`) regrava `compStartDate/EndDate` com o default mas NÃO desliga `compPeriodManual`:
  com período manual ativo, a aba passa a mostrar 1º/jan → hoje ainda marcada "Período: definido na aba", com o botão "Seguir filtro global".
- **`prevYearDates`:** 29/02 vira 01/03 do ano anterior (overflow do `setFullYear`); os dois períodos podem ter número de meses diferente e o rótulo
  que falta no gráfico fica "?" (reproduzido em `graficoComp`).
- **Agrupamento por mês/ano** (gráfico e anos do pivô) usa `vigLocal || vig`; comparações de intervalo usam `vig`/`em`/`fim`.
- **Taxa de renovação** ancora no término de vigência (`fim`); **churn do Comparativo** é `1 − R(período) ÷ (N+R do ano anterior)` e pode ser negativo
  (METRICAS.md). Funções próprias do Comparativo (`calcChurnComp`); o antigo também não reusa `retencao.ts` aqui.
- **Seção recolhida:** o antigo não redesenha seções recolhidas (e o pivô não é refeito ao reabrir); no novo os blocos seguem atualizados (invisíveis).
- **Modal de exportação** (`#comp-pivot-export-modal`) fica fora de `#tab-comparativo` no antigo; no novo é um portal em `document.body`, só quando aberto.
- **Exportações:** `.xlsx` (`Comparativo_Seguradora.xlsx`/`_Ramo`/`_Seguradora_Ramo`, aba "Comparativo", exatamente a visão em tela, inclusive grupos
  recolhidos) comparado novo × antigo em `tests/parity/exportar-comparativo.test.ts`. PDF (`Comparativo_Seguradora_Ramo.pdf`, JPEG 0,92 de
  `#comp-pivot-wrap`, página do tamanho da imagem, paisagem se largura ≥ altura) com `import()` dinâmico de `html2canvas` 1.4.1 e `jspdf` 2.5.1 só no clique;
  o antigo as carrega por `<script>` da CDN e sai em silêncio se não carregarem.
- **Cenários extras:** `comparativo-pivo-recolhido-comissao`, `comparativo-ranking-seg-comissao`, `comparativo-ranking-ramo`, `comparativo-manual-seguir-global` e um por métrica.

## Task 19 — Metas e Acompanhamento semanal

- **De onde vem a meta:** não há constante nem planilha. Meta = base × (1 + % digitado), com um % para Novos e outro para Renovações (padrão 10, texto
  vazio/inválido = 0); a base é a vigência global deslocada 1 ano para trás (só o ano muda na string) ou, sem vigência, o ano civil anterior a "hoje".
  Só N/R/EN/ER entram; N+EN = Novos, R+ER = Renovações; ramos excluídos (`META_EXCLUDED_KEYS`) ficam fora; Pessoais = `META_PESSOAIS_KEYS`, o resto Patrimoniais.
- **"Hoje"** só entra no ano da base sem vigência: o antigo usa `today().getFullYear()` (data local do navegador); o novo usa o ano de `base.hoje`
  (data civil de São Paulo). O acompanhamento semanal não depende de "hoje" (só da vigência global).
- **Fonte de dados:** `ALL` (`base.linhas`) com os filtros globais aplicados por `filterMetasData` (não usa `FD`): comparação de vigência por string,
  linha sem vigência fica de fora (diferente de `applyFilters`, em que a linha sem data passa); botões de tipo valem pelo tipo literal (marcar só "N" não traz EN).
- **Quirk reproduzido: rótulo "Base:"** passa pelo `Date`: com vigência até 29/fev de ano bissexto, a base é 29/fev do ano anterior (inexistente) e o rótulo
  mostra 01/mar (o filtro compara a string e ainda usa 29/fev, que nada casa). Coberto em `tests/domain/metas.test.ts`.
- **Semanas:** domingo→sábado a partir do dia 1 da vigência; fragmento inicial de até 3 dias funde com a semana seguinte; a última nunca funde. A meta de
  cada semana é a do período × dias/total de dias. O realizado das semanas é por **emissão** (fora do intervalo, vai à semana da borda mais próxima);
  os 6 cartões somam por **vigência** — por isso o total do cartão pode diferir da soma das semanas (reproduzido).
- **Seção recolhida:** como no Comparativo, o antigo não redesenha seção recolhida (badge e conteúdo ficam velhos até reabrir); o novo mantém os blocos
  atualizados (invisíveis). Só difere com a seção fechada.
- **Sem dados (`ALL` vazio):** o antigo sai de `renderMetasTab` sem tocar nada (o rótulo fica "—"); o novo mostra "—" e blocos vazios.
- **Estado:** %, equipe/métrica focadas, ordenação e visão Total/Novos-Renovações sobrevivem à troca de aba (`useEstadoAba`) e NÃO são zerados pelo
  "Limpar filtros" (o `resetFilters` antigo não os toca).
- **Modo apresentação:** o botão "▶ Modo apresentação" existe (mesmo texto/classe), mas ainda sem ação — Task 20. `computeMetaWeeks`, `buildMetasSemanal`,
  `buildMetasEquipeCards`, `META_TEAMS`, `METAS_SEM_TEAM_*` estão exportados (`src/domain/metas*.ts`); o `withKfPeriod` do antigo vira passar `FiltrosGlobais` com a vigência trocada.
- **CSS:** bloco METAS TAB do `styles.css` (+ `.kickoff-btn`) em **global** (`src/styles/metas.css`) porque a Exibição TV reutiliza `.msem-*` e a apresentação o `.kickoff-btn`.
- **Cenários extras:** `metas-equipe-pessoais`, `-patrimoniais`, `-metrica-comissao`, `-comissao-patrimoniais`, `-ordenacao`, `-ordenacao-nome`, `-detalhe`, `-pct`
  (digitando 25 e vazio nos %) e `-mes-curto` (outubro/2026: fragmento de 3 dias funde). Exportações `.xlsx` comparadas em `tests/parity/exportar-metas.test.ts`.
- **Dados reais:** pulado, sem `parity/data/` (Ruling 3).

## Task 20 — Modo apresentação / kickoff

- **Rota em vez de overlay:** no antigo `#kickoff-mode` é um overlay (`openKickoff()`, z-index 9999) por cima do painel. No novo é a rota `/apresentacao`
  (tela cheia, sem a casca); o botão "▶ Modo apresentação" da aba Metas navega para `/apresentacao` preservando `?f=`, e "Sair ✕" / Esc voltam para `/metas`
  com os mesmos filtros (o antigo só escondia o overlay, e a aba aberta era sempre a Metas, de onde o botão vive). Reabrir mostra a tela de escolha de novo.
  Sem dados de produção: alerta "Carregue os dados antes de gerar a apresentação." (no botão; numa visita direta a `/apresentacao` o alerta aparece e volta para `/metas`).
- **Quirk reproduzido: "↩ Opções" nunca aparece.** O CSS define `.kf-back { display:none }` e o JS, ao abrir os slides, só limpa o `style.display` inline
  (`back.style.display = ''`), que devolve o botão ao `display:none` da folha de estilo. O botão existe (e o texto "↩ Opções" entra no `textContent`), mas fica
  invisível; para voltar à escolha só se sai (Sair/Esc) e abre de novo. Reproduzido (mesmo CSS e mesma lógica de visibilidade).
- **Chooser:** precisa das duas pontas da vigência (senão a mensagem "Selecione um período de vigência na aba Metas para gerar a apresentação."); os slides só
  conferem a vigência inicial. Fechamento de mês = capa, 3 divisórias, 3 slides do mês anterior (acumulado, com base do ano anterior), 3 de evolução semanal,
  3 da meta do mês e "BORA TIME!" (14 slides); semana = capa, divisória, 3 da semana, divisória, 3 do mês, fechamento (10). Equipes: pessoais, patrimoniais, geral.
  `kfStart` sem slides: alerta "Não há dados suficientes para gerar a apresentação neste período.".
- **`withKfPeriod`:** o antigo troca temporariamente `#f-vig-s/#f-vig-e` e restaura; o novo passa `FiltrosGlobais` com a vigência trocada (mesmos números).
  O mês anterior (`kfPrevMonthPeriod`) é calculado em UTC (o antigo usava `Date` local; só aritmética de mês, sem diferença).
- **"Hoje"** da semana padrão (`findIndex` por `fmtD(today())`): o novo usa `base.hoje`. A tela de escolha sempre passa o número da semana, então o caminho só
  vale na API de domínio (`buildKickoffSlides` sem `weekIdx`, e `weekIdx` 0 = "sem número").
- **% de meta:** os digitados na aba Metas (estado `metas:novos/renov`), como o `getMetaPcts()` do antigo lendo os inputs.
- **Teclado:** Esc em qualquer tela; → PageDown Espaço / ← PageUp só nos slides (com `preventDefault`). O antigo registrava o `keydown` em `document` ao abrir
  (e abrir duas vezes empilharia ouvintes); o novo registra ao montar a rota.
- **PDF:** `kickoff-<mês>-<ano>.pdf` (mês/ano da capa, minúsculo, hífen), paisagem 1280×720 px, JPEG 0,92, `scale: 2`, uma página por slide (como o antigo, slide sem
  `.kf-page` é pulado), animações do Chart.js desligadas durante a captura e `kf-in` fixado no clone; `html2canvas` 1.4.1 e `jspdf` 2.5.1 por `import()` dinâmico só no clique.
  Falha ao carregá-las: alerta "Bibliotecas de PDF não carregaram…"; outro erro: "Não foi possível gerar o PDF: …". O botão mostra "Gerando... i/n". O antigo as carrega por `<script>` da CDN.
- **Harness:** a apresentação abre pelo botão da Metas no novo e por `openKickoff()` no antigo; `Cenario.pos` são os passos depois de aberta. O snapshot da apresentação
  não inclui `#dash-subtitle`/`#rec-badge` (cabeçalho do painel, que está atrás do overlay no antigo e não existe na rota nova). 34 cenários: escolha, sem vigência,
  cada slide do fechamento (14) e da semana 3 (10), semanas 1 e 4, setembro, % 25/vazio, fim da fila, Anterior e ponto.
- **Dados reais:** pulado, sem `parity/data/` (Ruling 3).
