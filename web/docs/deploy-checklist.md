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

- [ ] Copiar as planilhas reais para `web/parity/data/` (`producao*.xlsx`, `sinistrosAvisados.xlsx`, `sinistrosPagamentos.xlsx`, `saude_fernando.xlsx` se houver). Não vão para o git.
- [ ] `npm run regressao:real`.
  - Verificar: saída 0 e `parity/.golden/relatorio.md` sem diferenças. Anexar o relatório ao PR.

## e. Checagens no preview da Vercel

- [ ] Login com a conta do Mitz abre `/visao-geral` com os dados reais.
- [ ] Conta do tenant que não está na lista cai em `/sem-acesso`.
- [ ] `curl -i https://<preview>/api/dados` (sem cookie) responde 401.
- [ ] O site antigo continua igual, e `curl -i https://<site antigo>/web/package.json` responde 404.
- [ ] Medir no Network do preview a primeira carga de `/visao-geral` e comparar com a seção "Desempenho" do README.

## f. Pendências antes de virar o domínio

- [ ] Aba Sinistros (Task 21): pulada por decisão do Mitz; hoje a aba mostra o aviso de "em migração".
- [ ] Advisories de jsPDF 2.5.1 e dompurify: versões fixas por paridade com o app antigo; planejar a atualização.
- [ ] Estender a fixture para cobrir o cartão da meta mensal da Exibição TV (follow-up).
- [ ] Decidir cada item de `docs/divergencias.md` (manter a paridade ou corrigir).
- [ ] Só então decidir a virada do domínio (fora deste plano).
