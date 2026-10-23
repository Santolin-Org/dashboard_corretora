# Pendências da Etapa 1 (migração para Next.js)

Itens conhecidos que ficaram para depois do merge. Nenhum deles muda números, mas
alguns precisam estar resolvidos antes da troca de domínio.

## Antes da troca de domínio
- **Aba Sinistros não migrada** (Task 21 pulada por decisão do Mitz em 21/10/2026). A
  leitura das planilhas de sinistros e a API já existem; falta a tela. Mostra "Em migração".
- **Passos do `deploy-checklist.md`** que dependem do Mitz: registro no Azure, projeto na
  Vercel, Neon, Blob, `seed/usuarios.json` e a verificação do tamanho da resposta de
  `/api/dados` no preview (o limite de 4,5 MB só se confirma lá).
- **Divergências em `divergencias.md`** para o Mitz decidir se corrige (comportamentos do
  app antigo reproduzidos de propósito).
- **Fixture da Exibição TV:** a fixture não tem vendas novas no mês corrente; estender com
  linhas N de out/2026 e regenerar os dourados para a paridade cobrir o cartão da meta mensal.
- **jsPDF 2.5.1 / dompurify 2.5.9** têm alertas de segurança publicados; mantidos pela
  paridade. Planejar a atualização.

## Melhorias sem urgência
- Cache do corpo gzip de `/api/dados`: uma entrada por chave de escopo distinta (gestão, cada
  vendedor, "nada") dentro do `versão|hoje` atual; quando `versão|hoje` muda, o cache é limpo. Não
  há limite de entradas por escopo — com muitos vendedores, acompanhar a memória. Nenhum corpo de
  outro escopo é servido.
- ~~ETag de `/api/dados` com o escopo inteiro~~ **Resolvido na Etapa 3 (Task 3):** o ETag
  é o hash de `chaveEscopo` com a lista de nomes ordenada completa.
- Painel do produtor: comparar mês parcial até o mesmo dia (hoje o mês corrente é comparado
  com o mês inteiro do ano anterior).
- Incluir o arquivo de licença OFL junto das fontes em `src/styles/`.
- No processamento em paralelo, arquivos depois de um arquivo ilegível ainda são baixados
  e processados antes da parada.
- Memória do servidor chegou a 1,3 GB com a base real; acompanhar na Vercel.
- Testes que faltam para caminhos que a fixture não exercita (ranking do Comparativo com
  mais de 25 linhas, filtro de emissão, semanas de Metas com emissão fora do intervalo).

## Melhorias menores do painel do produtor
- `painel-produtor.ts`: comentário sobre `vigFim` `${mes}-31` depender de comparação de string; `mesNum` chamado 2x.
- ~~`vincularNome`: janela TOCTOU entre select e upsert~~ **Resolvido na revisão final:** o upsert só atualiza
  se o dono atual é o mesmo login (o banco decide). Segue aberto: e-mail duplicado concorrente em `salvarUsuario`
  vira erro de constraint.
- APIs admin/produtores: `catch {}` devolve 503 sem log; `ativo !== false` aceita ausente como true; faltam testes
  de `ignorar` não booleano e de `userId`/`id` não inteiros; `listarUsuarios` roda a cada requisição.
- Testes: linha duplicada e alias `sessao` em `auth.test.ts`; falta teste de componente na virada dez/jan e do selo
  ▼/% não zero; teste da dupla não confere prêmio somado; falta teste do cinza de inativo e do botão desabilitado.
- Filtro/sort repetidos em `escopo.ts` sem comentário. (Comentário "Cache limitado" de `corpo-dados.ts` corrigido.)
- Barra lateral: sticky de 59px fixo não acompanha cabeçalho quebrado abaixo de 900px; gaveta fechada ainda focável
  pelo teclado; vendedor com `/api/eu` falhando vê lista de gestão (cosmético). (`useUsuario` agora busca de novo
  quando a base muda e o Meu painel tem "Tentar novamente".)
- Painel: `lerMin` no render (risco de hydration se renderizado no servidor); mês não ressincroniza se o dia virar;
  lista "A renovar" sem altura máxima.
- Menus (seletor de produtores e telas de usuários) sem fechar com Esc/clique fora e sem `role`; cor `#4e80ff` fixa em
  `SeletorProdutores.module.css`.
- Tela de usuários: `.lado ul` sobrescreve `.menu`; menu de dono sem estado vazio; aviso não limpa ao abrir formulário
  ou salvar; tabela sem overflow abaixo de 900px.
- Nomes vinculados a usuários **inativos** aparecem em "Nomes sem dono" na página Produtores, mas não na tela
  Usuários e vínculos. De propósito em Produtores (dá para avaliar a produção de quem saiu); a diferença entre as
  duas telas pode confundir.
