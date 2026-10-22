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
- Cache do corpo gzip de `/api/dados` é zerado quando um vendedor (escopo "nada") acessa
  entre acessos da gestão; a gestão re-codifica o corpo (~0,2 s). Nenhum corpo errado é servido.
- Na Etapa 3, o ETag de `/api/dados` precisa usar o escopo inteiro (lista de
  colaboradores), não só o tipo.
- Incluir o arquivo de licença OFL junto das fontes em `src/styles/`.
- No processamento em paralelo, arquivos depois de um arquivo ilegível ainda são baixados
  e processados antes da parada.
- Memória do servidor chegou a 1,3 GB com a base real; acompanhar na Vercel.
- Testes que faltam para caminhos que a fixture não exercita (ranking do Comparativo com
  mais de 25 linhas, filtro de emissão, semanas de Metas com emissão fora do intervalo).
