# Painel do produtor, navegação lateral e vínculos login ↔ colaborador — design

Data: 22/10/2026 · Autor: Mitz (decisões) + Claude (redação; marcações **[decisão do Claude]**)
Antecede: o construtor de painéis (Etapa 2 do design da migração). Este documento antecipa a
"Etapa 3 — acesso por vendedor" de `2026-10-20-migracao-nextjs-design.md` §1 e §5.4.

## 1. Intenção

Hoje o app novo (Next.js, `web/`, em `bi.santolinseguros.com.br`) só serve admin e gestão; um
vendedor que entra vê "Seu acesso ao dashboard será liberado na próxima etapa". O Mitz quer que
cada produtor (vendedor) entre com a conta M365 e veja **somente a própria produção**, num painel
pensado para o dia a dia dele: como está o mês, o que precisa renovar e como vai o ano. Admin e
gestão usam a mesma tela para avaliar um ou mais produtores.

Junto vêm duas mudanças estruturais pedidas pelo Mitz:
- uma **barra lateral** vira a navegação principal, no lugar das abas do topo;
- uma **tela só do admin** para cadastrar usuários e vincular cada login aos nomes da planilha.

**Regra de segurança (inegociável, herdada da §5.4):** um vendedor nunca recebe linhas de outro.
O recorte acontece **no servidor, antes do envio**; o navegador do vendedor não tem como ver
dados alheios, nem pelo DevTools.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. Vendedor entra e cai em **Meu painel** com os dados dele (seção 4).
2. Admin e gestão têm a página **Produtores** com o mesmo painel e um seletor de produtores (seção 5).
3. Barra lateral substitui as abas do topo para todos os papéis (seção 6).
4. Tela **Usuários e vínculos**, só admin: usuários, papéis, ativo/inativo e vínculos login ↔ nomes
   da coluna COLABORADOR (seção 7).
5. Escopo no servidor passa a ter o tipo "colaboradores" (seção 8).

**Não-objetivos (desta entrega)**
- Construtor de painéis (continua sendo a próxima etapa).
- Vendedor ver as abas de hoje (Produção, Retenção, Cross-sell…) recortadas. Nesta versão o
  vendedor vê **só** Meu painel (decisão do Mitz: "hoje o produtor vê só essa aba").
- Metas individuais por produtor, ranking entre produtores, notificações.
- Mudar a Exibição TV ou a Apresentação (seguem em tela cheia, sem a barra lateral).
- Mexer no app antigo (`index.html`/`main.js`) ou no projeto Vercel `dashboard-corretora`.

**Anti-objetivos (seria fracasso mesmo "funcionando")**
- Qualquer caminho em que linhas de outro colaborador cheguem ao navegador de um vendedor
  (inclusive `/api/fontes`, metadados, contagens ou mensagens de erro).
- Números das abas existentes mudarem para admin/gestão. A paridade com o app antigo
  (`npm run parity`) continua 0 diffs.
- Um vendedor sem vínculo ver dados de alguém (sem vínculo = painel vazio com aviso).

## 3. Contexto que o construtor precisa saber

- Stack e convenções: ver `docs/superpowers/specs/2026-10-20-migracao-nextjs-design.md` e
  `web/README.md`. Domínio puro em `web/src/domain/`, servidor em `web/src/server/`, páginas em
  `web/src/app/(dash)/`. Testes: `npm run regressao` (lint, typecheck, build, vitest, test:tz,
  paridade Playwright), também no CI. **Toda mudança traz teste de regressão** (regra global do Mitz).
- Usuários: tabela `users` (Neon, Drizzle) com `email` (minúsculo), `nome`, `role`
  (`admin|gestao|vendedor`), `ativo`. Login: Auth.js + Entra ID, relendo o banco a cada requisição.
- Escopo: `web/src/server/escopo.ts` (`escopoDoUsuario`, `aplicarEscopo`) é o **único ponto** que
  decide o que cada usuário recebe; `/api/dados` já monta o corpo por escopo e inclui o escopo no ETag.
- Coluna COLABORADOR (`Linha.colab`): texto livre do Quiver. Exemplos reais (Mitz, 22/10/2026):
  `GABRIEL DA SILVA VERAS - SANTOLIN`, `FERNANDO DE PAULA SERAFIM` (sem sufixo),
  `ALESSANDRA (OFICIAL) - SANTOLIN`, `PARMAIS - SAÚDE - ALESSANDRA - SANTOLIN`,
  `TRANSFERENCIA CORRETAGEM - SANTOLIN`, `SANTOLIN - CONSULTORIA ADMINISTRAÇÃO E CORRETAGEM DE SEGUROS LTDA`,
  e **apólices com mais de um nome** separados por `" , "`:
  `GABRIELA ALENCAR MOZERLE - SANTOLIN , MATHEUS GUILHERME DOEGE - SANTOLIN`,
  `CELSO LUIS SANTOLIN - SANTOLIN , ALESSANDRA (OFICIAL) - SANTOLIN , VERA LUCIA PERES - SANTOLIN`.
- As abas existentes tratam `colab` como o texto inteiro (uma dupla é "outro colaborador"). **Isso
  não muda** nelas — paridade.

## 4. Meu painel (vendedor)

Rota sugerida `/meu-painel` **[decisão do Claude]**. Vendedor que entra em `/` é levado para lá.
Layout aprovado nos esboços 4 e 5 (`.superpowers/brainstorm/…/vendedor-layout-v4.html`, `sidebar-v5.html`):

Cabeçalho: "Olá, {primeiro nome}" e "{Mês} de {ano} · dados até hoje, {dd/mm}".

### 4.1 Linha de cima, metade esquerda — "Minha produção em {mês}"
- Três números: **apólices**, **prêmio líquido**, **comissão** do mês corrente.
- Gráfico: **duas barras horizontais**, `{mês}/{ano-1}` e `{mês}/{ano}`, cada uma **empilhada em
  Novas (N) e Renovações (R)**, com o valor escrito em cada segmento; abaixo de cada barra,
  "Total R$ … · comissão R$ …". Medida das barras: **prêmio líquido** **[decisão do Claude]**.
- Selo de variação: "▲/▼ x,x% sobre {mês}/{ano-1}" (verde se subiu, vermelho se caiu).
- Mês corrente comparado com o **mês inteiro** do ano anterior **[decisão do Claude]** (o mês atual
  ainda está em andamento; o selo deixa isso implícito — ver Pendências).
- **Recorte de produção (Mitz): a mesma regra da aba Produção**, como se a aba Produção fosse
  filtrada pelos nomes do vendedor e pelo mês de **vigência**: tudo o que ela soma entra, inclusive
  endossos e cancelamentos descontando. Os três números, o "Total" sob cada barra e o mês a mês (4.3)
  usam essa mesma regra e **batem com a aba Produção** filtrada pelo mesmo colaborador e período.
  "Apólices" segue a contagem que a aba Produção mostra. Reusar as funções de `web/src/domain/`
  da aba Produção em vez de reimplementar.
- Segmentos da barra **[decisão do Claude]**: "Novas" = família N (N, EN, CN) e "Renovações" =
  família R (R, ER, CR), para que N + R some exatamente o total do mês. Lançamentos de outros tipos,
  se a aba Produção os somar, vão para um terceiro segmento "Outros" só quando existirem.

### 4.2 Linha de cima, metade direita — "A renovar"
**Regra (aprovada pelo Mitz):** entra na lista a linha que
- é apólice (`isApolice`, não endosso/fatura);
- tem `tipo` **N ou R**;
- tem **fim de vigência no mês selecionado**;
- tem situação **Ativa** (ainda não venceu) ou **Vencida** (passou do fim sem renovar);
- ficam fora `Renovada`, `Cancelada`, `Suspensa`, `Perda Total`.

Comportamento:
- **Filtro de mês** (setas ‹ › e o nome do mês) que **abre sempre no mês atual**, com selo "atual".
- Ordenação: fim de vigência mais próximo primeiro.
- Cada item: cliente, ramo, seguradora, data de fim, faixa de cor à esquerda e um selo de prazo
  ("amanhã", "em 3 dias", "venceu há 4 dias").
- **Faixas de urgência (Mitz):** ≤1 dia, ≤3, ≤7, ≤15, ≤30; acima de 30 dias, cinza neutro.
  Cores do esboço: 1d `#FF3B3B`, 3d `#FF6B4A`, 7d `#F5A623`, 15d `#d6c23a`, 30d `#7fb3ff`,
  >30 `#3E4D68`, vencida `#7f1d1d`.
- **Vencidas:** no mês atual, as que já passaram do fim aparecem num **grupo próprio no topo,
  recolhível** ("▾ Vencidas em {mês} sem renovação · N — minimizar"). O estado minimizado é
  lembrado por navegador (localStorage) **[decisão do Claude]**.
- Mês passado: lista as que venceram naquele mês sem renovação (todas no grupo de vencidas).
  Mês futuro: lista as que vencem no mês; a cor só acende a 30 dias ou menos **[decisão do Claude]**.
- Contagem no título: "A renovar · {n} em {mês}".
- Com mais de um produtor (seção 5), cada item mostra também **de quem é** a apólice.

### 4.3 Linha de baixo, largura total — "Minha produção em {ano}, mês a mês"
- 12 meses do ano corrente; por mês, **duas barras lado a lado**: prêmio líquido (azul `#4E80FF`) e
  comissão (verde `#2DD4A0`), **com o valor escrito** em cima de cada barra (formato curto: 48k, 7,9k).
- Cada série com **escala própria** **[decisão do Claude]** (comissão ≈ 15% do prêmio; na mesma
  escala a barra verde sumiria); tooltip com valores completos. Mês atual destacado; meses futuros vazios.

### 4.4 Estados
- Vendedor **sem vínculo**: painel com aviso "Seu login ainda não está ligado a um nome da
  planilha. Fale com o administrador." e nenhum dado.
- Sem dados no período: cada bloco mostra vazio próprio, sem quebrar o layout.
- Telas estreitas: as duas metades empilham **[decisão do Claude]**.

## 5. Página Produtores (admin e gestão)

- Item "Produtores" na barra lateral, grupo "Equipe". Mesmo painel da seção 4.
- **Seletor** no topo (busca + caixas de marcar), escolhidos viram etiquetas removíveis.
- Quem aparece no seletor **[decisão do Claude]**: as pessoas com vínculo (login + nomes) e os
  nomes da planilha **sem dono** que não estão marcados como "não é pessoa", em dois grupos.
- **Vários marcados = soma** (Mitz aprovou). Apólice com mais de um dos marcados conta **uma vez**.
- Sem ninguém marcado: mostrar instrução "Escolha um ou mais produtores" **[decisão do Claude]**.
- O seletor lembra a última escolha por navegador **[decisão do Claude]**.
- Admin/gestão já recebem "tudo"; o recorte aqui é no cliente (não é fronteira de segurança).

## 6. Barra lateral

Substitui o componente de abas do topo (`web/src/components/Abas.tsx`) **para todos os papéis**.
Esboço aprovado: `sidebar-v5.html`.

- Topo: marca "SANTOLIN / Dashboard". Pé: nome, papel e "Sair".
- Admin/gestão — grupos e itens:
  - **Painéis:** Visão geral, Produção, Retenção & Churn, Cross-sell, Comparativo, Metas, Sinistros
    (mesmas rotas de hoje);
  - **Equipe:** Produtores;
  - **Exibição:** Apresentação, Exibição TV (o fluxo de escolher o painel da TV antes de abrir continua);
  - **Admin** (só admin): Usuários e vínculos.
- Vendedor: só **Meu painel**.
- Item ativo destacado (fundo azul suave + traço à esquerda).
- O que hoje fica no cabeçalho (filtros globais, painel de fontes, "Exibição TV") continua
  funcionando; onde cada controle mora no novo layout fica a critério do construtor, desde que
  nada se perca **[decisão do Claude]**.
- Telas estreitas: barra recolhível (botão ☰) **[decisão do Claude]**.
- Apresentação e Exibição TV seguem em **tela cheia, sem barra**.
- **Paridade:** o harness (`web/parity/novo.ts`) navega pelas abas; ajustar a navegação do lado novo
  para a barra lateral sem afrouxar nenhuma comparação.

## 7. Usuários e vínculos (só admin)

Esboço aprovado: `vinculos-v6.html`. Rota sugerida `/admin/usuarios` **[decisão do Claude]**.
Bloqueada no servidor para quem não é admin (página e APIs), não só escondida no menu.

- **Tabela de logins:** nome, e-mail, papel, ativo, e os **nomes da planilha vinculados** como
  etiquetas (× para remover, "+ nome" abre busca entre os nomes distintos da coluna COLABORADOR,
  já separados por `" , "`). Login sem vínculo mostra aviso amarelo.
- **+ Novo usuário** / editar: e-mail (sempre minúsculo, `@santolinseguros.com.br` não é exigido
  pelo app — o tenant já restringe), nome, papel, ativo. Desativar no lugar de apagar.
- **Coluna "Nomes sem dono":** nomes distintos sem vínculo, com a quantidade de apólices; clique
  para vincular a um login; ação "não é pessoa" (ex.: `TRANSFERENCIA CORRETAGEM - SANTOLIN`) que
  tira o nome da coluna e do seletor de Produtores (reversível).
- Um nome pode estar vinculado a **um** login só **[decisão do Claude]** (evita dois vendedores
  "donos" do mesmo nome por engano); um login pode ter **vários** nomes.
- O admin não pode tirar o próprio papel de admin nem se desativar **[decisão do Claude]**.
- Mudanças valem na próxima requisição (o servidor já relê o banco a cada chamada).
- Registrar quem alterou e quando em cada vínculo/usuário **[decisão do Claude]**.

**Seed:** `src/server/db/seed.ts` hoje desativa quem não está no JSON. Com a tela, o banco passa a
ser a fonte da verdade: o seed vira só "garante que estes existem" e **não desativa ninguém**
**[decisão do Claude]**.

## 8. Escopo no servidor

- `Escopo` ganha `{ tipo: "colaboradores"; nomes: string[] }`.
- `escopoDoUsuario`: admin/gestão → "tudo"; vendedor ativo com vínculos → "colaboradores";
  vendedor sem vínculo → "nada".
- `aplicarEscopo`: mantém a linha se **algum** nome de `colab`, separado por `" , "` (com `trim`),
  estiver em `nomes`. **Valor cheio** para cada um (Mitz): a linha vai inteira, sem dividir prêmio
  nem comissão.
- Comparação de nomes exata após `trim` **[decisão do Claude]** (os nomes vêm de lista fechada na
  tela de vínculos, escolhidos dos próprios dados).
- Tudo que sai do servidor para o vendedor passa por esse recorte: `/api/dados`, `/api/fontes`
  (metadados: o vendedor não precisa deles; devolver vazio ou 403) e qualquer rota nova.
- O ETag/cache do corpo comprimido já leva o escopo; com escopos por vendedor, conferir que o cache
  não mistura corpos entre usuários (ver pendência "ETag full escopo" em `web/docs/pendencias.md`).
- O vendedor recebe as linhas dele de **todos os anos** carregados (o comparativo anual e a lista
  "A renovar" precisam do ano anterior).
- **Valor cheio também na exibição (Mitz):** no painel de um vendedor, a apólice compartilhada conta
  100% do prêmio e da comissão para ele, sem dividir e sem marcador. Somando os painéis de todos os
  vendedores, o total pode passar do total da empresa; é esperado. Na página Produtores, com vários
  marcados, a apólice compartilhada conta uma vez (seção 5).
- Sinistros: o vendedor **não** recebe sinistros nesta entrega **[decisão do Claude]** (não há tela
  dele que use; menos dado exposto).

## 9. Testes exigidos (além da regressão existente)

- Escopo: vendedor recebe só linhas com o nome dele, inclusive em apólices compartilhadas; não
  recebe linha de dupla em que ele não está; sem vínculo → nada; gestão/admin → tudo.
- Rotas: vendedor em `/api/fontes`, `/admin/*` e páginas de gestão → bloqueado.
- "A renovar": regra da 4.2 (situações, tipos, endosso, mês), ordenação e faixas de urgência nas
  bordas (1, 3, 7, 15, 30 dias; vencida).
- Produção do mês e comparativo N+R; mês a mês com prêmio e comissão.
- Seletor de Produtores: soma sem contar duas vezes a apólice compartilhada.
- Vínculos: um nome só em um login; admin não se rebaixa; não-admin não acessa.
- Paridade: 0 diffs nas abas existentes após a troca para barra lateral.

## 10. O que fica com o construtor

Nomes de rotas, componentes e tabelas; biblioteca de gráfico (usar a que o app já usa); onde cada
controle do cabeçalho vai morar; detalhes visuais finos dentro do tema existente (`tokens.css`).

## 11. Pendências conhecidas

- Comparar o mês corrente parcial com o mês inteiro do ano anterior pode parecer queda no começo
  do mês. Alternativa futura: comparar até o mesmo dia.
- Apólices canceladas da campanha 360 ainda contam na barra da TV (pergunta antiga, sem resposta).
