# Vínculo manual de renovações feitas em outro nome — desenho

Data: 13/11/2026. App novo (`web/`), aba Renovações.

## Por quê

A aba Renovações liga cada apólice que venceu à sua renovação pelo CPF/CNPJ + ramo + início da R a até 1 dia do fim
da antiga (`ligarRenovacoes` em `web/src/domain/renovacoes.ts`). Quando o cliente renova em outro nome — cônjuge,
filho, a empresa dele — a ligação não acontece:

- a antiga fica sem renovação ligada. Se a planilha marca a situação "Renovada", ela conta nas renovadas, mas o
  prêmio e a comissão da renovação não entram no card; senão aparece como vencida/em aberto;
- a renovação nova aparece solta em "Outros vencimentos" ("Sem apólice anterior ligada").

Caso que motivou (nomes trocados): a apólice de ANA EXEMPLO SILVA aparece "Renovada", e a renovação, em nome do
cônjuge BRUNO EXEMPLO SILVA, aparece em Outros vencimentos.

O objetivo é a gestão poder dizer ao dash "esta renovação é desta apólice", e o dash passar a tratar o par como se a
ligação automática o tivesse achado.

## O que o Mitz decidiu

- Só a **gestão** (papéis `gestao` e `admin`) faz e desfaz vínculos, e só na **aba Renovações**.
- As **duas formas** de vincular (esboço aprovado):
  - **A — a partir da apólice que venceu:** botão "Vincular renovação" na linha da antiga; abre uma busca nas
    renovações sem apólice anterior ligada, com as da mesma seguradora e ramo primeiro.
  - **B — a partir da renovação solta:** em "Outros vencimentos", botão "Vincular à apólice anterior" na linha da R
    sem antiga; abre uma busca nas apólices que chegaram para renovar e estão sem renovação ligada.
- Depois do vínculo, a linha **continua com o nome da apólice anterior** (ANA EXEMPLO…) e ganha uma indicação
  "renovada como BRUNO EXEMPLO SILVA". O prêmio/comissão da R passam a contar no card, no período da antiga, e a R
  sai de "Outros vencimentos". Há um botão "Desfazer vínculo".

- **Só apólices lançadas como R** podem ser vinculadas como renovação. Quando a seguradora emite um seguro novo
  porque o prazo passou, a Santolin lança no sistema como R se o cliente renovar em até **90 dias** depois do fim
  da antiga; depois disso lança como N, e aí não é renovação.
- Por isso o vínculo manual só aceita R com início **até 90 dias depois do fim da antiga** (a tela nem sugere as
  de fora; a API recusa com 400).

- A ligação **automática não muda** (continua exigindo início da R a até 1 dia do fim da antiga). Renovações
  atrasadas do mesmo cliente também passam pelo vínculo manual, porque "esses casos é sempre bom conferir".

## Comportamento

### Guardar

- Tabela nova `vinculos_renovacao` no Neon, no padrão de `atribuicoes_renovacao`:
  - antiga: `seg`, `apolice`, `fim` (mesma chave da atribuição);
  - renovação: `ren_seg`, `ren_apolice`, `ren_vig`;
  - `alterado_por`, `alterado_em`.
  - Chave primária na antiga; a renovação também é única (uma R só pode ser renovação de uma antiga).
- Histórico em tabela à parte (`vinculos_renovacao_historico`: vincular/desfazer, quem, quando), como o das atribuições.
- Migração nova (0003). Rodar no Neon de produção exige OK do Mitz; roda primeiro no Neon de dev (`preview/dev`).

### API

- `GET /api/vinculos-renovacao`: gestão/admin e vendedor leem (o vendedor precisa deles para ver os números iguais aos da
  gestão). `PUT` (vincular) e `DELETE` (desfazer): só gestão/admin. Mesmo padrão de `/api/atribuicoes`
  (`exigirPapel`, `bypassAtivo` → lista vazia, `indisponivel()` se o banco falhar).
- Conflito (decisão do Mitz): se a antiga já tem vínculo manual, ou se a R já está vinculada a outra antiga, o PUT
  sem `substituir: true` responde 409 com o par que já existe. A tela mostra um alerta ("Esta apólice já está
  vinculada a … Desfazer esse vínculo e vincular a esta?"). Com OK, reenvia com `substituir: true`: o servidor desfaz
  o(s) vínculo(s) antigo(s) e grava o novo numa transação, registrando no histórico os desfeitos e o novo. A tela
  então avisa "Vínculo desfeito na apólice <nº>" com link para essa apólice (a lista filtra/rola até ela).
  Cancelar não muda nada.

### Ligação

- `ligarRenovacoes` passa a receber os vínculos manuais e os aplica **antes** da ligação automática: o par manual é
  fixado e nem a antiga nem a R entram na disputa automática. Vínculo cuja antiga ou R não existe mais na planilha é
  ignorado (sem erro).
- O mesmo conjunto de vínculos é passado onde mais se chama `ligarRenovacoes` (`aplicarAtribuicoes`), para que a
  atribuição siga a R vinculada exatamente como segue a ligada automaticamente.
- O vínculo manual vale em todo lugar onde a ligação automática vale, com as mesmas consequências (decisão do
  Claude, para não haver dois tipos de ligação):
  - recorte do vendedor no servidor (`aplicarEscopo` em `web/src/server/escopo.ts` → `/api/dados`): os vínculos
    entram ali e na chave de cache/ETag do escopo;
  - atribuição: se a antiga foi atribuída, a R vinculada vai junto para o novo responsável — e, como já acontece com
    a ligada automaticamente, passa a contar em Metas/painel do produtor/Comparativo pelo `resp`.
- Fora disso nada muda: Produção, Metas e painel do produtor continuam lendo o tipo e o colaborador da planilha.

### Tela (aba Renovações)

- Botões A e B aparecem só para gestão/admin, e só onde não há ligação: A na antiga sem renovação ligada (qualquer
  situação); B na R de Outros vencimentos sem antiga.
- Candidatas: só R (tipo `R`, apólice, fora Cancelada/Perda Total/Suspensa) com início até 90 dias depois do fim
  da antiga. Antes do fim não há limite fixo (renovação antecipada); a ordem das sugestões já põe as mais próximas
  primeiro (decisão do Claude).
- Busca do diálogo: nome, CPF/CNPJ ou número da apólice (mesma regra da busca da lista). Sem termo, mostra as
  sugestões: mesma seguradora e ramo primeiro, depois pela distância entre o início da R e o fim da antiga.
- A busca procura na base inteira, não só no período filtrado: a renovação pode ter começado em outro mês.
- Linha vinculada: nome da antiga + etiqueta "renovada como <cliente da R>" quando o cliente for diferente; botão
  "Desfazer vínculo" (só gestão). Ligações automáticas não mostram o botão.
- Erro ao gravar: mensagem na própria tela, nada muda.

## Fora do escopo

- Vínculo automático por parentesco/empresa (sobrenome, sócio): não há dado confiável na planilha para isso.
- Desfazer ligações automáticas erradas.
- Ampliar a janela da ligação automática para 90 dias.
- Vincular fora da aba Renovações (painel do produtor, Produção).

## Testes de regressão

- Domínio: par manual fixado antes do automático; vínculo com linha sumida ignorado; R vinculada sai de "outros" e
  soma no card; atribuição segue a R vinculada.
- Banco (PGlite): gravar, conflito sem `substituir` (antiga e R), substituir desfazendo o anterior, desfazer, histórico.
- API: papéis (vendedor não grava), validação, janela de 90 dias, 409 com o par existente, `substituir`.
- Componentes: botões só para gestão, diálogo A e B, alerta de conflito e aviso com link, etiqueta "renovada como", desfazer.
- `npm run regressao` verde antes do PR; dados reais nunca em fixture.

## Deixado para quem implementa

Nomes de componentes e arquivos, formato exato do diálogo (seguindo o esboço), mensagens de erro, ordem das
sugestões em empate.
