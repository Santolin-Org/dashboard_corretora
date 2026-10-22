# Checklist de deploy e validação (projeto Vercel novo)

> **AGUARDA MITZ.** Nada abaixo foi executado. Cada passo precisa de uma ação sua (conta Azure, Vercel, Neon,
> planilhas reais). O domínio de produção **não** muda neste checklist.

Variáveis e scripts: ver `README.md`.

## a. Azure

- [ ] Executar `docs/azure-setup.md` (registro do aplicativo, segredo, permissões Graph com consentimento do admin).
  - Verificar: o passo de teste do documento obtém token; o segredo foi copiado na hora.
- [ ] Incluir como redirect URI o domínio do projeto novo: `https://<domínio-do-preview-ou-novo>.vercel.app/api/auth/callback/microsoft-entra-id` (mais o de localhost já listado).
  - Verificar: login no preview não dá `AADSTS50011` (redirect inválido).

## b. Vercel

- [ ] Criar projeto novo apontando para este repositório, **Root Directory `web/`**, **sem domínio de produção**.
- [ ] Adicionar Neon pelo Marketplace (cria `DATABASE_URL`) e criar um Blob store no projeto (cria `BLOB_READ_WRITE_TOKEN`).
- [ ] Definir as variáveis: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_SECRET`,
  `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
  (`https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/v2.0`), `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`.
  - Verificar: Settings > Environment Variables lista exatamente essas nove.
- [ ] Confirmar que **nenhuma** `PARITY_*`, `FONTE` ou `FONTE_DIR` está definida.
  - Verificar: a mesma tela; se `PARITY_AUTH_BYPASS` existisse, o app lançaria erro na Vercel.

## c. Banco e usuários

- [ ] Copiar `seed/usuarios.example.json` para `seed/usuarios.json` e preencher (`email`, `nome`, `role` = `admin` | `gestao` | `vendedor`).
  O e-mail é o atributo `mail` da conta no Entra. Regras: lista não vazia, ao menos um `admin`, sem duplicados (o seed recusa).
- [ ] Com `DATABASE_URL` do Neon no ambiente local: `npm run db:migrate && npm run db:seed`.
  - Verificar: o seed imprime `seed: N usuário(s) sincronizado(s)`; no console do Neon a tabela `users` tem as linhas esperadas.

## d. Paridade com dados reais

> **Portão de merge e de virada do domínio:** sem `npm run regressao:real` com saída 0 (ou só com divergências
> aceitas e listadas em `docs/divergencias.md`) sobre as planilhas reais do dia, não se faz o merge de
> `nextjs-migracao` nem a virada. Primeira execução (2026-10-21, 6 planilhas de produção + saúde, sem sinistros):
> 0 diferença em 111 cenários.

- [ ] Ter as cópias das planilhas reais numa pasta **fora do repositório** (ex.: `~/Documents/dashboard-planilhas-paridade/`) e rodar `PARITY_DADOS=~/Documents/dashboard-planilhas-paridade npm run regressao:real`. Planilhas nunca vão para o git (`*.xlsx` no `.gitignore`).
- [ ] `npm run regressao:real` (cobre as abas já portadas; Sinistros fica de fora, por decisão do Mitz).
  - Verificar: saída 0 e `parity/.golden/relatorio.md` sem diferenças. Anexar o relatório ao PR.

## e. Checagens no preview da Vercel

- [ ] Login com a conta do Mitz abre `/visao-geral` com os dados reais.
- [ ] Conta do tenant que não está na lista cai em `/sem-acesso`.
- [ ] `curl -i https://<preview>/api/dados` (sem cookie) responde 401.
- [ ] O site antigo continua igual, e `curl -i https://<site antigo>/web/package.json` responde 404.
- [ ] **Tamanho de `/api/dados` com a base real.** Logado como `admin`, no Network do preview (ou
  `curl -sS -o /dev/null -D - -H 'Accept-Encoding: gzip' -H 'Cookie: <cookie da sessão>' https://<preview>/api/dados -w '%{size_download}\n'`):
  - Verificar: status 200, `content-encoding: gzip`, `etag` presente, `cache-control: private, no-cache`, e o
    tamanho transferido (gzip) anotado aqui: ______ B (esperado abaixo de 4,5 MB; ver README, "Limite de 4,5 MB").
  - Verificar: um segundo carregamento responde 304; nos logs da Function não aparece `FUNCTION_PAYLOAD_TOO_LARGE` (413).
  - Se falhar (413 ou tamanho perto de 4,5 MB): não seguir; dividir `/api/dados` por ano ou mover agregações para o
    servidor (spec §5.3).
- [ ] Medir no Network do preview a primeira carga de `/visao-geral` e comparar com a seção "Desempenho" do README (indicativo: aquela medição foi local, com NODE_ENV=development no processo por causa do guard do bypass; refazer no preview da Vercel com a base real).

## f. Pendências antes de virar o domínio

- [ ] Aba Sinistros (Task 21): pulada por decisão do Mitz; hoje a aba mostra o aviso de "em migração".
- [ ] Advisories de jsPDF 2.5.1 e dompurify: versões fixas por paridade com o app antigo; planejar a atualização.
- [ ] Estender a fixture para cobrir o cartão da meta mensal da Exibição TV (follow-up).
- [ ] Decidir cada item de `docs/divergencias.md` (manter a paridade ou corrigir).
- [ ] Só então decidir a virada do domínio (fora deste plano).
