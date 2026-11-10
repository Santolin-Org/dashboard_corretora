# Atribuição de renovações a outro colaborador — design

Data: 10/11/2026. Pedido do Mitz (gestão). App: `web/` (Next.js), dados em `/api/dados`, banco Neon (Drizzle).

## Por que

Todo mês, apólices que chegam para renovar vão para um colaborador diferente do que está no nome
delas na planilha. Hoje o painel atribui tudo pelo `COLABORADOR` da linha, então a carteira "a renovar"
e a base de crescimento de cada produtor ficam erradas. Casos reais de agora:

- **Nathalia Letícia → Cesar e Gabriela:** a carteira da Nathalia está sendo dividida entre os dois,
  apólice por apólice.
- **Victor → Gustavo e Gabriel:** no ano passado o Victor emitiu renovações da carteira deles (saíram
  no nome do Victor). Este ano os próprios renovam, então essas apólices devem contar para eles.
- **Celso e Denise → Victor:** eles mandam renovações para o Victor fazer.

A planilha não tem como registrar isso, então a informação precisa viver no painel.

## O que é

Um gestor (papel `gestao` ou `admin`) atribui uma **apólice que chega para renovar** a um novo
responsável, **apólice por apólice**. A atribuição fica gravada no banco do painel, com quem fez e
quando, e passa a valer em todas as abas listadas abaixo.

A atribuição é feita na **apólice antiga** (a que chega para renovar) e vale também para a renovação
dela emitida neste ano (ver "Respostas do Mitz").

### Objetivos

1. Gestor atribui, troca ou desfaz o responsável de uma apólice, direto no painel.
2. A atribuição vale em:
   - **Aba Renovações:** com o filtro de colaborador, a apólice atribuída aparece para o novo responsável
     (e some do original) na lista e nos cards de "chegaram para renovar".
   - **Painel do produtor ("A renovar"):** o vendedor vê as apólices atribuídas a ele e não vê as que
     foram atribuídas a outro.
   - **Metas:** a base do ano anterior por colaborador conta a apólice atribuída para o novo responsável.
   - **Comparativo:** o crescimento das renovações do produtor (cartão *Prêmio renovação*, cuja base é a
     produção N + R do ano anterior, e a *Taxa de renovação*, cuja safra é por fim de vigência) usa a
     base com as apólices atribuídas.
3. Fica registrado quem atribuiu e quando. Desfazer é possível e também fica registrado.

### Não objetivos

- Não muda o colaborador da linha na aba Produção, Visão geral, Retenção, Cross-sell, Exibição TV e
  Apresentação. A produção histórica continua de quem produziu.
- Não altera a planilha nem o SharePoint.
- Não há regra em massa (por ramo, por colaborador inteiro). É caso a caso.
- O vendedor não atribui nada; só vê o efeito.

### Anti-objetivos (seria falha mesmo funcionando)

- Contar a mesma apólice para os dois colaboradores (o original e o novo) ao mesmo tempo.
- Um vendedor passar a receber linhas de colaboradores que não têm nada a ver com ele.
- Perder atribuições quando a planilha é reexportada ou o cache da base é refeito.
- Mudar números de abas fora da lista acima (a paridade com o app antigo precisa continuar passando
  nelas, exceto onde a divergência é intencional e registrada em `parity/diff.ts`).

## Decisões já tomadas

- **Identidade da apólice:** seguradora + número da apólice (`chaveApolice` em
  `web/src/domain/situacoes.ts`). Os endossos (EN/ER) da apólice usam a mesma chave e acompanham a
  atribuição onde a base os soma (Metas, Comparativo).
- **Responsável** é um nome da coluna COLABORADOR (o mesmo valor usado no filtro global e nos
  vínculos de usuário), não um usuário de login.
- **Onde atribuir:** na lista "Apólice por apólice" da aba Renovações, com uma ação por linha
  (escolher o novo responsável numa lista de colaboradores; "voltar ao original" desfaz). A coluna
  Colaborador mostra o responsável atual e indica quando é atribuído (com o original no tooltip).
- **Quem pode:** `gestao` e `admin`. As rotas de escrita seguem o padrão de `src/app/api/admin/*`
  (checagem de papel no servidor).
- **Armazenamento:** tabela nova no Neon, migração Drizzle. Aplicar a migração em produção precisa do
  OK do Mitz.

## Respostas do Mitz (10/11/2026)

1. **A apólice atribuída sai da base de quem produziu no ano anterior e aparece só para quem ela foi
   atribuída.** Vale também para a renovação emitida neste ano: a R ligada à antiga atribuída (ligação
   de `ligarRenovacoes`, CPF/CNPJ + ramo + vigência) conta para o novo responsável nas abas da lista
   (Renovações: card de renovações e %; Metas: realizado; Comparativo: período atual), mesmo que tenha
   saído na planilha no nome de outro (ex.: Victor emitiu, carteira do Gustavo).
2. **Na Metas, para o novo responsável a apólice atribuída entra sempre na base de renovações**, mesmo
   que tenha sido N no ano anterior: quando ela renova, vira R. Ela não entra na meta de novos de
   ninguém (sai inteira da base do produtor original, N e R).

 (Claude), para o Mitz conferir

- **A atribuição é de uma vigência, não do número da apólice para sempre:** chave = seguradora + número
  + fim de vigência da apólice antiga. Algumas seguradoras mantêm o número na renovação; sem o fim na
  chave, a atribuição arrastaria a R nova e as vigências antigas. Os endossos que contam junto são os
  dessa vigência (início de vigência do endosso dentro dela).
- **Nome composto ("A , B") é substituído inteiro** pelo novo responsável; desfazer volta à string
  original.
- **Qualquer apólice da lista pode ser atribuída**, inclusive já Renovada ou Vencida, porque corrigir o
  passado é parte do uso (caso Victor → Gustavo). A linha mostra que está atribuída; os números de
  períodos passados mudam de propósito.
- **Vendedor:** só tem o painel pessoal (`/meu-painel`). As linhas de terceiros que passam a chegar a
  ele (apólices atribuídas) só entram na lista "A renovar". A produção dele continua por `colab`, então
  não infla.

## Restrições técnicas que o construtor precisa respeitar

- **Escopo do vendedor:** `/api/dados` recorta as linhas por nome antes de codificar
  (`aplicarEscopo` em `src/server/escopo.ts`). Para o vendedor ver uma apólice atribuída a ele, o
  recorte precisa incluir as linhas dessa apólice (e dos endossos dela), e excluir não é necessário
  para as atribuídas a outro (o cliente aplica). A chave de cache do corpo (`corpoGzip`) e o ETag
  precisam mudar quando as atribuições mudam, senão o vendedor fica com dado velho.
- **Abertura instantânea (PR #7, se mergeado):** a cópia salva no navegador não pode mascarar uma
  atribuição recém-feita por mais tempo do que já mascara a planilha.
- **Testes de regressão** (CLAUDE.md global): regra de atribuição no domínio, efeito em cada aba
  listada, API (papéis, validação), escopo do vendedor. `npm run regressao` verde antes do PR.
- **Dados reais** nunca entram em git, fixtures ou PR; usar números e nomes fictícios.

## Deixado para o construtor

- Formato exato da tabela (atual + histórico, ou um log com a última linha valendo).
- Como as atribuições chegam ao cliente (no payload de `/api/dados` ou numa rota própria) e como o
  domínio as aplica (por exemplo um campo de "responsável pela renovação" calculado, sem tocar em
  `colab`).
- Visual da ação na linha e da indicação de "atribuída".
