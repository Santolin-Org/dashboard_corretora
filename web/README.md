# Dashboard Santolin (app Next.js)

Migração do dashboard estático da raiz do repositório (`index.html` + `main.js` + `styles.css`) para Next.js 16
(App Router, React 19). As regras de negócio são as do app antigo (`METRICAS.md`/`SKILL.md`; se divergirem, vale o
`main.js`); a meta da migração é **números idênticos** (ver "Harness de paridade"). O app antigo não é alterado:
`web/` está no `.vercelignore` da raiz e o domínio de produção continua apontando para o site antigo.

Como funciona: o servidor lê as planilhas do SharePoint (Microsoft Graph, ou de uma pasta local em desenvolvimento),
faz o parse, guarda o resultado (Neon/Postgres + Vercel Blob) e serve `/api/dados` com o recorte permitido ao usuário.
Login Microsoft Entra ID (Auth.js); quem não está na tabela `users` cai em `/sem-acesso`. Papéis: `admin`, `gestao`,
`vendedor`. Na Etapa 1, `admin` e `gestao` veem tudo, `vendedor` e quem não está na lista não recebem nada, e só `admin`
reprocessa as fontes. O `vendedor` vê a tela "Seu acesso ao dashboard será liberado na próxima etapa." (o servidor nem
monta a base para ele). Outros erros do Auth.js (ex.: `Configuration`) vão para `/erro-login`, que mostra o código.
Não há upload manual de Excel.

## Rodar localmente

Requisitos: Node LTS, `npm ci` dentro de `web/`.

### Com login real

1. Siga `docs/azure-setup.md` (registro do app no Entra; inclui o redirect `http://localhost:3000/api/auth/callback/microsoft-entra-id`).
2. `cp .env.example .env.local` e preencha (variáveis abaixo). Use um banco Neon de desenvolvimento.
3. `cp seed/usuarios.example.json seed/usuarios.json`, edite com os e-mails reais e rode `npm run db:migrate && npm run db:seed`.
4. `npm run dev` e abra http://localhost:3000.

### Modo dev sem login e sem Azure (`FONTE=local` + `PARITY_AUTH_BYPASS`)

Lê as planilhas de uma pasta local e dispensa login. Serve só para desenvolvimento e para o harness; o código lança
erro se `PARITY_AUTH_BYPASS=1` for combinado com `VERCEL` ou `NODE_ENV=production`.

```bash
# 1. gerar a fixture sintética (determinística, sem dado real) em parity/fixtures/out/ (ignorada pelo git)
TZ=America/Sao_Paulo npx tsx -e 'import("./parity/fixtures/make-fixture").then(m => m.gerarFixture("parity/fixtures/out"))'
# 2. subir o dev server apontando para ela
FONTE=local FONTE_DIR=$PWD/parity/fixtures/out PARITY_AUTH_BYPASS=1 PARITY_HOJE=2026-10-15 \
AUTH_SECRET=qualquer-coisa-local TZ=America/Sao_Paulo npm run dev
```

Para usar planilhas reais sem login, aponte `FONTE_DIR` para uma pasta **fora do repositório** com as cópias (recomendado: `~/Documents/dashboard-planilhas-paridade/`). Com o `.env.local` do Azure preenchido e sem `FONTE=local`, o servidor lê direto do SharePoint.

## Variáveis de ambiente

Lista conferida contra `grep process.env` em `src/`, `parity/` e nos arquivos de configuração. O modelo está em `.env.example`.

| Variável | Para que serve | Onde obter |
|---|---|---|
| `AZURE_TENANT_ID` | Credencial de aplicativo para ler o SharePoint (Graph). Tenant `59190e65-5cad-4885-9f2d-77a59385667b` | `docs/azure-setup.md`, passo 1 |
| `AZURE_CLIENT_ID` | ID do aplicativo (Graph) | `docs/azure-setup.md`, passo 1 |
| `AZURE_CLIENT_SECRET` | Segredo do aplicativo (Graph) | `docs/azure-setup.md`, passo 2 (aparece uma vez) |
| `AUTH_SECRET` | Segredo de sessão, lido pelo próprio Auth.js | `openssl rand -base64 32` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Client ID do login (mesmo valor de `AZURE_CLIENT_ID`) | `docs/azure-setup.md` |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Segredo do login (mesmo valor de `AZURE_CLIENT_SECRET`) | `docs/azure-setup.md` |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Emissor OIDC; deve ser `https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/v2.0` (o código recusa outro tenant). Lido pelo Auth.js e conferido em `src/server/auth-core.ts` (`assertIssuerSeguro`) | `.env.example` |
| `DATABASE_URL` | Conexão Neon/Postgres (migrations, seed e app) | Marketplace Neon na Vercel, ou console do Neon |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (guarda os snapshots). Sem ele, usa armazenamento local | Blob store do projeto na Vercel |
| `FONTE` | `local` troca o SharePoint por uma pasta local (dev) | defina manualmente |
| `FONTE_DIR` | Pasta com as planilhas quando `FONTE=local` (obrigatória nesse caso) | defina manualmente |
| `AUTH_TRUST_HOST` | `true` ao rodar `next start` fora da Vercel (localhost); lido pelo próprio Auth.js | defina manualmente |
| `PARITY_AUTH_BYPASS` | `1` desliga o login (só dev/harness; erro com `VERCEL` ou `NODE_ENV=production`) | defina só localmente |
| `PARITY_HOJE` | "Hoje" fixo `YYYY-MM-DD`, honrado só com o bypass ativo | só harness |
| `TZ` | O harness fixa `America/Sao_Paulo`; `test:tz` roda os testes de domínio em `UTC` e em `America/Sao_Paulo`. Na Vercel o servidor roda em UTC; o tratamento de datas está em `src/domain/datas.ts` e `src/server/hoje.ts` | não definir na Vercel |
| `NEXT_DIST_DIR`, `NEXT_TSCONFIG` | Uso interno do harness (`.next-parity`, `tsconfig.parity.json`) | não definir |

**Nunca defina nenhuma `PARITY_*` na Vercel.**

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js. Observe que o bypass de login não funciona em `NODE_ENV=production` |
| `npm run lint` / `typecheck` | ESLint; `next typegen && tsc --noEmit` |
| `npm test` | Vitest (domínio, servidor, componentes) |
| `npm run test:tz` | Testes de domínio em `TZ=UTC` e em `TZ=America/Sao_Paulo` |
| `npm run test:parity` | Testes Playwright em `tests/parity` |
| `npm run parity -- <flags>` | Harness de paridade (abaixo) |
| `npm run regressao` | `lint`, `typecheck`, `build` (`next build`), `test`, `test:tz`, `test:parity` e `parity -- --lado ambos --fixture` |
| `npm run regressao:real` | `parity -- --lado ambos --dados $PARITY_DADOS` (planilhas reais; padrão `parity/data`) |
| `npm run db:generate` | Gera migration do Drizzle a partir de `src/server/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrations em `DATABASE_URL` |
| `npm run db:seed` | Insere em `users` os e-mails de `seed/usuarios.json` que ainda não existem (e-mail minúsculo). Nunca desativa nem sobrescreve usuário existente |

Regras do seed: lista não vazia, ao menos um `admin`, sem e-mails duplicados. O e-mail deve ser o atributo `mail` da
conta no Entra. `seed/usuarios.json` é ignorado pelo git; o formato está em `seed/usuarios.example.json`.

### Usuários e vínculos

A fonte da verdade dos usuários é a tela de administração **Usuários e vínculos** (`/admin/usuarios`, só `admin`):
ela cria e edita usuários, muda papel, ativa/desativa e vincula cada login aos nomes da coluna COLABORADOR (vendedor
vê só as linhas dos seus nomes). O seed serve apenas para o primeiro admin e para incluir e-mails que faltam; rodar de
novo não desfaz o que foi feito na tela.

Deploy: a migration `0001` (tabelas `vinculos` e `nomes_ignorados`) precisa de `npm run db:migrate` no banco de
produção antes de subir esta versão. Quem roda é o Mitz.

## Harness de paridade

Compara o app antigo (carregado do `index.html` da raiz, com as planilhas injetadas como o `_spFetchAndLoad` faz) com
o app novo, em cenários de filtros e abas, por textos de `id` do DOM e dados dos gráficos (`window.__charts`).

Flags de `npm run parity --`: `--lado antigo|novo|ambos`, `--cenario <nome>`, `--abas a,b`, `--dados <pasta>`,
`--fixture`, `--regerar-antigo`. Com `--fixture` usa a fixture sintética e os dourados versionados em
`parity/golden-fixture/`; sem ela, usa `parity/data/` e dourados em `parity/.golden/` (ignorado pelo git). Sem
`--abas`/`--cenario`, roda só as abas listadas em `parity/abas-portadas.ts`.

**Dourados da fixture são cópias congeladas da saída do app antigo.** `parity/golden-fixture/` guarda o que o
`index.html`/`main.js` da raiz produziram sobre a fixture sintética quando foram gerados; `--lado ambos --fixture`
compara o app novo com essa cópia (o CI não sobe o app antigo do zero). Se o `main.js` da raiz mudar algum dia,
os dourados ficam velhos: regere com `npm run parity -- --lado antigo --fixture --regerar-antigo`, confira o diff e
versione.

**Dados reais:** mantenha as cópias **fora do repositório** (ex.: `~/Documents/dashboard-planilhas-paridade/`) e rode `PARITY_DADOS=~/Documents/dashboard-planilhas-paridade npm run regressao:real` (pasta com `producao*.xlsx`, `sinistrosAvisados.xlsx`,
`sinistrosPagamentos.xlsx` e, se houver, `saude_fernando.xlsx` — nunca vão para o git). Depois
leia `parity/.golden/relatorio.md`. Esperado: saída 0 e nenhuma diferença; qualquer diferença sai com código 1 e é
listada no relatório.

## Regra de regressão

Rode **`npm run regressao` antes de todo commit** (regra do Mitz para todos os projetos). O CI
(`.github/workflows/web-regressao.yml`) roda o mesmo comando em cada push/PR que toque `web/**` e anexa
`relatorio.md` se falhar.

## Divergências conhecidas

Comportamentos do app antigo reproduzidos de propósito (ou ajustados) e que dependem de decisão do Mitz estão em
`docs/divergencias.md`.

## Desempenho (primeira carga de `/visao-geral`)

Medido em 2026-10-21, localmente, com a fixture sintética (439 linhas de produção + sinistros), cache do navegador
desligado, Chromium via Playwright (CDP `Network.loadingFinished.encodedDataLength`, bytes transferidos),
`TZ=America/Sao_Paulo`.

**Método.** App novo: `npm run build` e `next start` (build de produção) com `FONTE=local`/bypass, que exige
`NODE_ENV=development` no ambiente do processo, e só para esta medição; carregar `/visao-geral` e esperar a rede
ociosa. App antigo: `index.html`, `main.js` e `styles.css` servidos com gzip -9 (como a Vercel faria) por um servidor
estático local, com as CDNs e o Google Fonts reais; somados ainda os `.xlsx` da fixture (já compactados, tamanho do
arquivo), que o app antigo baixa do SharePoint. Requisições duplicadas por redirecionamento local foram contadas uma vez.

| Item (bytes transferidos) | App novo | App antigo |
|---|---:|---:|
| HTML | 3.791 | 8.278 |
| JS (app + libs) | 228.733 | 74.242 (main.js) + 473.793 (CDNs: msal, xlsx, Chart.js, html2canvas, jsPDF) = 548.035 |
| CSS | 14.078 (4 arquivos, inclui o da aba) | 12.506 + 1.456 (Google Fonts) = 13.962 |
| Fontes (woff2) | 115.232 (3, hospedadas junto; hoje em `src/styles/fontes.css`, sem preload) | 48.982 (1 vista na carga; o Google carrega as demais sob demanda) |
| Dados | 84.342 (`/api/dados`, JSON gzip) | 491.102 (5 `.xlsx` da fixture) |
| **Total** | **446.176** | **1.110.359** |
| Total sem fontes | 330.944 | 1.061.377 |

Indicativo: medido localmente com NODE_ENV=development no processo (por causa do guard do bypass); refazer no preview da Vercel com a base real.

Leitura: com a fixture o app novo transfere cerca de 40% do total do antigo. A diferença de JS vem de o app novo
não carregar `xlsx`, `msal`, `html2canvas` e `jsPDF` na primeira carga. O app novo também dispensa a leitura do Excel
no navegador (parse no servidor).

**Estimativa para a base real (não medida).** Medido no teste de tamanho `tests/domain/serializacao.test.ts` ("150 mil linhas", Task 9; `npx vitest run tests/domain/serializacao.test.ts` imprime `gzip ingênuo=... colunar=...` via console.log), com dados sintéticos de 150 mil linhas, portanto é estimativa para a base real: JSON ingênuo em gzip 3.785.097 B
contra o formato colunar atual em 1.409.589 B. Logo `/api/dados` deve ficar na ordem de 1,4 MB em gzip com a base inteira,
e o conjunto novo em torno de 1,7 MB (JS+CSS+HTML ≈ 0,25 MB mais fontes). O app antigo continuará baixando os `.xlsx`
inteiros: o tamanho real não foi medido (a fixture tem ~890 B/linha, o que extrapolaria a valores irreais; planilhas
reais têm strings compartilhadas e ficam menores, mas a ordem esperada é de dezenas de MB para 150 mil linhas),
além dos ~550 KB de JS. Confirmar com `npm run regressao:real` e o Network do navegador no preview.

### Limite de 4,5 MB de resposta da Vercel (decisão)

A página de limites das Vercel Functions (https://vercel.com/docs/functions/limitations, seção "Request body size",
lida em 2026-10-21) diz que o corpo da requisição **ou da resposta** de uma Function tem no máximo 4,5 MB (acima disso,
`413 FUNCTION_PAYLOAD_TOO_LARGE`). A página não diz se o limite vale para o tamanho comprimido ou descomprimido. O guia
https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions recomenda streaming e diz que
as funções em streaming não têm esse limite. Com dados reais, o JSON colunar de `/api/dados` passa de 19 MB (150 mil
linhas); em gzip fica entre 1,4 MB (teste sintético) e 1,8 MB (medição da revisão final). Por isso, `/api/dados`:

- calcula o corpo **já em gzip** uma vez por (versão, dia, escopo) e guarda em memória só o da versão atual
  (`src/server/corpo-dados.ts`; o recorte de escopo acontece antes de codificar);
- envia esse gzip com `Content-Encoding: gzip` (e `Vary: Accept-Encoding`), **em streaming** (pedaços de 64 KB). O
  navegador descomprime sozinho; um cliente sem `gzip` no `Accept-Encoding` recebe o JSON descomprimido;
- mantém ETag, 304 e `Cache-Control: private, no-cache` como antes.

**Com a base real** (planilhas de `parity/data/`, 2026-10-21, local): 50.909 linhas de produção (7 fontes), JSON
cru de 7.744.922 B (acima de 4,5 MB, então o gzip é necessário), corpo gzip enviado de 1.474.124 B (`curl` no
`next dev`: `content-encoding: gzip`, `Transfer-Encoding: chunked`, 304 com ETag), 192 ms para comprimir uma vez.
Montagem da base no servidor: fria, sem snapshots, 9,4 s; processo novo com snapshots, 0,16 s (armazém em
memória; com Blob soma o download); quente, base em memória, ~0 ms.

Medido localmente (dados sintéticos do teste de tamanho): 150 mil linhas = 1.413.151 B em gzip, 192 ms para comprimir;
300 mil linhas = 2.810.066 B, 422 ms; requisições seguintes reusam o buffer. Mesmo se o limite valesse para o corpo
comprimido e sem streaming, a base caberia até perto de 380 mil linhas (na proporção da medição da revisão). A
confirmação com a base real é o passo "Tamanho de `/api/dados`" de `docs/deploy-checklist.md` §e; se falhar, a saída
é dividir `/api/dados` por ano ou mover agregações para o servidor (spec §5.3).

## Pendências antes de virar o domínio

Ver `docs/deploy-checklist.md`. Resumo: Azure/Vercel/Neon/Blob e seed (Mitz); planilhas reais e `regressao:real` com
zero diferença; aba Sinistros (Task 21, adiada por decisão do Mitz); advisories de jsPDF 2.5.1/dompurify (versões
fixas por paridade, atualizar depois); extensão da fixture para o cartão da meta mensal da Exibição TV; decidir as
divergências de `docs/divergencias.md`. A virada do domínio não faz parte do plano: é decisão do Mitz após a validação
lado a lado.
