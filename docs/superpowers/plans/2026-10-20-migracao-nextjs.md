# Migração para Next.js — Etapa 1 (paridade) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o dashboard atual (`index.html` + `main.js` + `styles.css`) como um app Next.js em `web/`, com números idênticos, dados lidos no servidor e acesso por lista de usuários autorizados, sem tocar no app atual.

**Architecture:** O servidor lê o SharePoint (Graph, credencial de app), processa os Excel com as mesmas regras do `main.js` numa camada de domínio pura em TypeScript, guarda snapshots no Vercel Blob e entrega ao navegador o conjunto já normalizado e recortado pelo escopo do usuário. O navegador calcula KPIs, gráficos e tabelas com as mesmas funções de domínio. Um harness Playwright compara o app antigo e o novo sobre os mesmos arquivos reais: a régua de "pronto" é diferença zero.

**Tech Stack:** Next.js (App Router, versão estável mais recente via `create-next-app@latest`), TypeScript strict, Auth.js v5 (`next-auth@5`, provedor Microsoft Entra ID), Drizzle ORM + Postgres (Neon via Vercel Marketplace), `@vercel/blob`, SheetJS (`xlsx` 0.18.5, mesma versão do app atual), Chart.js 4.4.1 + `react-chartjs-2`, html2canvas 1.4.1 e jsPDF 2.5.1 (carregados sob demanda), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-migracao-nextjs-design.md`

## Global Constraints

- **Nada na raiz do repositório muda**, exceto acrescentar `web/` ao `.vercelignore` e `web/parity/data/` etc. ao `.gitignore`, e criar `.github/workflows/web-regressao.yml` (Task 1). `index.html`, `main.js`, `styles.css`, `auth.html`, `scripts/` e os registros Azure existentes (`18d14ac5…`, `b5812845…`) ficam intactos.
- **Regras de negócio não mudam.** `METRICAS.md` e `SKILL.md` são a especificação. Se divergirem do `main.js`, vale o `main.js`, e a divergência é anotada em `web/docs/divergencias.md` para o Mitz decidir.
- **Números idênticos (G2):** o harness de paridade (`npm run parity`) precisa sair com diferença zero em todos os cenários antes de a tarefa da aba ser considerada pronta.
- **Planilhas reais nunca vão para o git.** Ficam em `web/parity/data/` (ignorado). Snapshots dourados ficam em `web/parity/.golden/` (ignorado).
- **Fuso:** o harness roda com `TZ=America/Sao_Paulo` e "hoje" fixo em `2026-10-15T12:00:00-03:00`. O servidor na Vercel roda em UTC, e o domínio precisa produzir as mesmas datas `YYYY-MM-DD` que o `fmtD` do app antigo produz no navegador em São Paulo.
- **Sem `Math.min(...arr)`/`Math.max(...arr)`/`push(...arr)` sobre linhas**, porque um ano passa de 100 mil linhas.
- **Descoberta de produção:** nome normalizado (minúsculas, sem acento) casando `^producao.*\.xlsx?$`, ignorando `~$`. Arquivos fixos: `sinistrosAvisados.xlsx`, `sinistrosPagamentos.xlsx`, `saude_fernando.xlsx` (opcional). SharePoint: host `santolinseguros.sharepoint.com`, biblioteca `Santolin`, pasta `Dashboard`. Tenant `59190e65-5cad-4885-9f2d-77a59385667b`.
- **Upload manual de Excel é removido.** Falha de leitura mostra o erro e o painel de fontes, sem oferecer upload.
- **Papéis:** `admin`, `gestao`, `vendedor`. Na Etapa 1, `admin` e `gestao` veem tudo, `vendedor` e quem não está na lista não recebem nada, e só `admin` reprocessa fontes.
- **IDs de DOM:** todo elemento com `id` dentro das abas, do cabeçalho, do modal de fontes, da Exibição TV e do modo apresentação no `index.html`/`main.js` atual mantém o mesmo `id` no app novo, porque é por eles que o harness compara. Gráficos se registram em `window.__charts[<id do canvas antigo>]`.
- Textos de interface em português, iguais aos atuais.
- **Regressão a cada tarefa (regra do Mitz para todos os projetos).** `npm run regressao` roda, em sequência, `lint`, `tsc --noEmit`, `test` (Vitest, inclusive `test:tz`) e `parity -- --lado ambos --fixture` (paridade sobre a fixture sintética, só nas abas já portadas, listadas em `parity/abas-portadas.ts`). **Toda tarefa termina rodando `npm run regressao` com saída 0, antes do commit.** O mesmo comando roda no GitHub Actions a cada push e PR que toque em `web/`. Os testes que cada tarefa escreve são permanentes: nunca apagar, pular (`.skip`) ou afrouxar um teste para uma tarefa passar. Uma mudança intencional de comportamento atualiza o teste, e isso é dito no commit. Antes de cada merge, rodar também `npm run regressao:real` (paridade em todos os cenários sobre `parity/data/` real, só local, porque os dados não vão para o CI).

## Review Focus

1. **Datas em UTC no servidor.** Uma célula `01/01/2025` precisa virar `2025-01-01` no servidor (UTC) exatamente como o app antigo mostra em São Paulo, inclusive datas que o SheetJS entrega com segundos de desvio. Teste na Task 3.
2. **A TV perde a sessão no meio do dia.** O esperado é aparecer um aviso visível de "entrar novamente", e não ficar com dados congelados sem aviso, nem quebrar a tela. Teste na Task 13.
3. **SharePoint fora do ar, Graph com 401/403, ou pasta sem nenhum `producao*`.** O esperado é uma tela de erro com a mensagem, incluindo a lista de arquivos da pasta quando nada casa, igual à do app atual. Os sinistros continuam se só a produção falhar. Teste na Task 8.
4. **Duas requisições disparam reprocessamento ao mesmo tempo, ou o arquivo muda no meio.** O esperado é que nenhuma resposta misture snapshot antigo com novo e que o manifesto continue coerente com os snapshots servidos. Teste na Task 8.
5. **Usuário removido da lista com sessão ainda válida.** O esperado é perder o acesso aos dados na próxima requisição, sem esperar a sessão expirar. Teste na Task 6.

---

## Estrutura de arquivos

```
.vercelignore                     (+ linha "web/")
web/
  package.json, next.config.ts, tsconfig.json, vitest.config.ts, playwright.config.ts, drizzle.config.ts
  .env.example
  docs/azure-setup.md             passo a passo do registro novo (Mitz executa)
  docs/divergencias.md            divergências METRICAS.md × main.js encontradas
  src/domain/                     PURO: sem React, sem rede, sem process.env
    datas.ts formatos.ts ramos.ts situacoes.ts tipos.ts
    producao/parse.ts producao/base.ts producao/cobertura.ts producao/enriquecimentos.ts
    saude/parse.ts saude/aplicar.ts
    sinistros/parse.ts
    filtros.ts                    filtros globais → linhas filtradas
    visao-geral.ts producao-aba.ts retencao.ts crosssell.ts comparativo.ts metas.ts metas-semanal.ts sinistros-aba.ts exibicao-tv.ts apresentacao.ts
  src/server/
    db/schema.ts db/client.ts db/seed.ts
    auth.ts escopo.ts
    fontes/tipos.ts fontes/graph.ts fontes/pasta-local.ts
    ingestao.ts snapshots.ts
  src/app/
    layout.tsx  page.tsx (redireciona para /visao-geral)
    (dash)/layout.tsx  (dash)/visao-geral/page.tsx … (uma pasta por aba)
    exibicao-tv/page.tsx  apresentacao/page.tsx
    api/auth/[...nextauth]/route.ts  api/dados/route.ts  api/fontes/route.ts  api/fontes/reprocessar/route.ts
  src/components/                 Cabecalho, Abas, FiltrosGlobais, MultiSelect, Grafico, Kpi, Tabela, PainelFontes, AvisoSessao, ModoTv
  src/client/                     useBase (download+decodificação), estado de filtros, registro window.__charts
  src/styles/tokens.css           variáveis/tema portadas do styles.css
  parity/
    data/ (ignorado)  .golden/ (ignorado)
    fixtures/make-fixture.ts      gera planilhas sintéticas para testes
    cenarios.ts snapshot.ts antigo.ts novo.ts diff.ts run.ts
  tests/                          Vitest (espelha src/)
```

---

### Task 1: Esqueleto do app em `web/`

**Files:**
- Create: `web/` (via `npx create-next-app@latest web --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*"`), `web/vitest.config.ts`, `web/tests/smoke.test.ts`, `web/.env.example`
- Modify: `.vercelignore` (acrescentar `web/` com o comentário "App Next.js novo — projeto Vercel próprio"), `.gitignore` (acrescentar `web/parity/data/`, `web/parity/.golden/`, `web/.env*.local`)

**Interfaces:**
- Produces: scripts `npm run dev | build | test | lint | parity | regressao | regressao:real` em `web/package.json` (`parity` = `tsx parity/run.ts`). Até a Task 12 existir, `regressao` roda só `lint`, `tsc --noEmit` e `test`. A Task 12 acrescenta a etapa de paridade.
- Create também: `.github/workflows/web-regressao.yml`, com gatilho `push` e `pull_request` em `paths: ['web/**']`. Usa Node LTS, `npm ci` em `web/`, `npx playwright install --with-deps chromium`, `TZ=America/Sao_Paulo` e `npm run regressao`.

- [ ] **Step 1:** Gerar o app, instalar `vitest`, `@playwright/test`, `tsx`, `xlsx@0.18.5`. Ligar `"strict": true` no tsconfig.
- [ ] **Step 2:** Escrever `tests/smoke.test.ts`, que verifica que `@/domain` resolve. Rodar `npm test`. Esperado: PASS.
- [ ] **Step 3:** Rodar `npm run build` em `web/`. Esperado: build sem erro.
- [ ] **Step 4:** Rodar `git diff --stat main -- . ':!web' ':!docs'`. Esperado: só `.vercelignore`, `.gitignore` e `.github/workflows/web-regressao.yml`.
- [ ] **Step 5:** Rodar `npm run regressao`. Esperado: saída 0. Depois do push, o workflow fica verde no GitHub.
- [ ] **Step 6:** Commit: `feat(web): esqueleto Next.js em web/ com suíte de regressão e CI`.

### Task 2: Harness de paridade — lado antigo e fixture sintética

O harness é a régua de todo o resto, então vem antes de qualquer porte.

**Files:**
- Create: `web/parity/fixtures/make-fixture.ts`, `web/parity/cenarios.ts`, `web/parity/snapshot.ts`, `web/parity/antigo.ts`, `web/parity/run.ts`, `web/playwright.config.ts`, `web/tests/parity/antigo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // snapshot.ts
  export type Snapshot = {
    textos: Record<string, string>;            // id → textContent com espaços colapsados e trim
    graficos: Record<string, { labels: string[]; datasets: { label?: string; data: (number|null)[] }[] }>;
  };
  // cenarios.ts
  export type Cenario = { nome: string; aba: AbaId; passos: Passo[] };  // AbaId = 'visao-geral'|'producao'|'retencao'|'crosssell'|'comparativo'|'metas'|'sinistros'|'exibicao-tv'|'apresentacao'
  export type Passo =
    | { tipo: 'preencher'; id: string; valor: string }    // input date/text: define value e dispara 'change'
    | { tipo: 'clicar'; seletor: string }
    | { tipo: 'multiselect'; id: 'ms-col'|'ms-grp'|'ms-ram'|'ms-seg'; valores: string[] };
  export const CENARIOS: Cenario[];
  export const HOJE_FIXO = '2026-10-15T12:00:00-03:00';
  // antigo.ts
  export function snapshotAntigo(page: Page, dataDir: string, c: Cenario): Promise<Snapshot>;
  // make-fixture.ts
  export function gerarFixture(dir: string): void;   // grava producao_2024.xlsx, producao_2026.xlsx (2025–2026), sinistrosAvisados.xlsx, sinistrosPagamentos.xlsx, saude_fernando.xlsx
  ```
- `run.ts` aceita `--lado antigo|novo|ambos` e `--cenario <nome>`. `antigo` grava `.golden/<cenario>.json`; `ambos` grava os dois e chama o diff (Task 12).

**Como o lado antigo é carregado (algoritmo):**
1. Servir a raiz do repositório com um servidor estático na porta 5599 (o próprio `run.ts` sobe o servidor com `http.createServer`).
2. `page.clock.install({ time: HOJE_FIXO })` e `context` com `timezoneId: 'America/Sao_Paulo'`, `locale: 'pt-BR'`.
3. Abrir `index.html`, esperar `typeof XLSX !== 'undefined' && typeof Chart !== 'undefined'`, e então, via `page.evaluate`, montar `payloads` a partir dos bytes dos arquivos de `dataDir` (passados como base64) exatamente como `_spFetchAndLoad` faz: `producao: [{ name, rows: parseProducaoArrayBuffer(buf), lastModified }]`, ordenados como o Graph lista (por nome), `sinistrosAvisados`, `sinistrosPagamentos` e `saude: { buf, lastModified }`. Depois chamar `applySharePointData(payloads, [])`. Não há login: o MSAL não é acionado.
4. Ativar a aba com `showTab(aba, botão)` e aplicar os passos.
5. Capturar `textos` de todo `[id]` dentro de `#tab-<aba>`, `#dash-subtitle` e `#rec-badge` (e do contêiner da Exibição TV/apresentação nos cenários dessas). Capturar `graficos` iterando o objeto global `charts` (`charts[id].data`).

- [ ] **Step 1:** Escrever `gerarFixture`: cerca de 400 linhas cobrindo os seis valores de `SITUAÇÃO` (incluindo `Perda total` em minúsculas), os seis tipos (`N R EN ER CN CR`), endossos com o mesmo número de `APÓLICE`, um par cancelada → reemitida em outra seguradora em até 15 dias (troca de seguradora), uma linha de 2021 perdida dentro do `producao_2026.xlsx`, uma linha duplicada idêntica entre os dois arquivos, PF e PJ (CNPJ com 15 dígitos de máscara), um saúde com prêmio zero e linha correspondente no `saude_fernando.xlsx`, e datas como `Date` e como número serial Excel. Cabeçalhos exatamente como em `COL`/`COL_SIN`/`SAUDE_COL` do `main.js`.
- [ ] **Step 2:** Escrever `CENARIOS` com, no mínimo, para cada aba de produção: `<aba>-padrao` (sem filtros); `<aba>-vigencia` (`f-vig-s=2026-01-01`, `f-vig-e=2026-09-30`); `<aba>-colab` (um colaborador em `ms-col`); `<aba>-tipos` (botões N e EN); `<aba>-ramo-seg` (um ramo e uma seguradora). Mais `sinistros-padrao`, `exibicao-tv-padrao` e `apresentacao-padrao`. Os cenários específicos de cada aba entram nas Tasks 14–22.
- [ ] **Step 3:** Escrever `tests/parity/antigo.test.ts` (Playwright): gera a fixture num diretório temporário, roda `snapshotAntigo` para `visao-geral-padrao` e verifica `Object.keys(s.textos).length > 10`, `s.graficos['ch-evolucao'].labels.length > 0` e `s.textos['rec-badge']` casando `/registros$/`.
- [ ] **Step 4:** Rodar `npx playwright test tests/parity/antigo.test.ts`. Esperado: FAIL antes do Step 5 e PASS depois.
- [ ] **Step 5:** Implementar `antigo.ts`, `snapshot.ts` e `run.ts --lado antigo`. Rodar `npm run parity -- --lado antigo` com a fixture e depois com `parity/data/` real. Esperado: um `.golden/*.json` por cenário, sem erro de console na página.
- [ ] **Step 6:** Commit: `test(web): harness de paridade — snapshot do app antigo`.

### Task 3: Domínio base — datas, formatos, ramos, situações e parse de produção

**Files:**
- Create: `web/src/domain/{datas,formatos,ramos,situacoes,tipos}.ts`, `web/src/domain/producao/parse.ts`, `web/tests/domain/{datas,ramos,situacoes,parse-producao}.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DataISO = string;                       // 'YYYY-MM-DD' ou '' (vazia)
  export type Linha = {
    tipo: string; vig: DataISO; em: DataISO; fim: DataISO; cli: string; seg: string; ramo: string; grp: string;
    premio: number; com: number; colab: string; sit: string; motivo: string; cancel: DataISO;
    docDigits: string; tipoPessoa: 'PF'|'PJ'|''; tipoDoc: string; campanha: string; apolice: string; endosso: string;
    trocaSeg: boolean; saudeManual?: boolean;          // preenchidos pelos enriquecimentos (Task 4)
  };
  // datas.ts
  export function celulaParaISO(v: unknown): DataISO;  // equivale a fmtD(toDate(v)) do main.js em America/Sao_Paulo
  export function addDiasISO(d: DataISO, n: number): DataISO;
  export function anoISO(d: DataISO): number;  export function mesISO(d: DataISO): number; // 1–12
  // formatos.ts — fBRL fN fP fPct fShort com a mesma saída do main.js
  // ramos.ts — normRamo canonRamo shortRamo classifyRamo metaTipoSide RAMOS_OFICIAIS META_EXCLUDED_KEYS META_PESSOAIS_KEYS
  // situacoes.ts — SIT SIT_DESFECHO_RENOVACAO normSit isApolice chaveApolice
  // producao/parse.ts
  export function parseProducao(buf: ArrayBuffer): Linha[];
  export const COL: Record<string, string>;            // cópia literal de COL do main.js
  ```
- **Decisão:** datas viram `DataISO` já no parse. As funções portadas trocam `fmtD(r.vig)` por `r.vig` e `getFullYear()`/`getMonth()` por `anoISO`/`mesISO`. Onde o `main.js` compara `Date` local com `fmtD` (UTC), o harness é quem diz se a troca é segura. Divergências entram em `docs/divergencias.md`.

- [ ] **Step 1:** Testes:
  - `celulaParaISO(45658) === '2025-01-01'` (serial Excel);
  - `celulaParaISO('2025-01-01') === '2025-01-01'`;
  - `celulaParaISO(new Date('2025-01-01T03:00:00Z')) === '2025-01-01'`;
  - `celulaParaISO('') === ''`;
  - o mesmo conjunto de valores dá resultados iguais rodando com `TZ=UTC` e com `TZ=America/Sao_Paulo` (rodar o arquivo duas vezes no script `test:tz`);
  - `normSit('Perda total') === 'Perda Total'`;
  - `canonRamo('ODONTOLÓGICO - COLETIVO')` igual a `canonRamo('Odontológico - Coletivo')`;
  - `classifyRamo('Vida em Grupo') === 'pessoais'` e `classifyRamo('Seguro Viagem Individual') === 'excluded'`;
  - `isApolice({endosso:'', tipoDoc:'APÓLICE'})` verdadeiro e `isApolice({endosso:'1', tipoDoc:'APÓLICE'})` falso;
  - `fBRL(1234.5) === 'R$ 1.234,50'` (normalizando o NBSP);
  - `parseProducao` da fixture: `tipoPessoa === 'PJ'` para o CNPJ de 15 dígitos e `vig` como `DataISO`.
- [ ] **Step 2:** Criar o script `test:tz` no `package.json` (`TZ=UTC vitest run tests/domain/datas.test.ts && TZ=America/Sao_Paulo vitest run tests/domain/datas.test.ts`). Rodar `npm test -- domain` e `npm run test:tz`. Esperado: FAIL.
- [ ] **Step 3:** Implementar, portando as funções literalmente das linhas 1–220 e 426–449 do `main.js`. A diferença é que `celulaParaISO` resolve o caso do serial Excel e do `Date` do SheetJS para a data civil de São Paulo, sem depender do fuso do processo.
- [ ] **Step 4:** Teste extra de paridade de parse: para cada linha da fixture, `parseProducao` (Node) gera os mesmos campos que o `parseProducaoArrayBuffer` antigo seguido de `fmtD` nos campos de data, rodado no Playwright em São Paulo (`tests/parity/parse.test.ts`). Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(domain): tipos, datas e parse de produção`.

### Task 4: Domínio — montagem da base (cobertura, dedup, enriquecimentos, saúde) e sinistros

**Files:**
- Create: `web/src/domain/producao/{cobertura,base,enriquecimentos}.ts`, `web/src/domain/saude/{parse,aplicar}.ts`, `web/src/domain/sinistros/parse.ts`, `web/tests/domain/{cobertura,base,enriquecimentos,saude,sinistros}.test.ts`

**Interfaces:**
- Consumes: `Linha`, `parseProducao`, `isApolice`, `chaveApolice` (Task 3).
- Produces:
  ```ts
  export type FonteProducao = { nome: string; linhas: Linha[]; modificadoEm: string /* ISO datetime */ };
  export type ManifestoFonte = {
    nome: string; total: number; duplicadas: number; anos: { min: number; max: number } | null;
    ativasVencidas: number; modificadoEm: string;
    anosIgnorados: { ano: number; cobertoPor: string }[];          // regra de cobertura
    sobreposicoes: { ano: number; com: string; linhas: number }[]; // abaixo de 50%: só aviso
  };
  export function aplicarCobertura(fontes: FonteProducao[]): { fontes: FonteProducao[]; manifesto: Pick<ManifestoFonte,'nome'|'anosIgnorados'|'sobreposicoes'>[] };
  export function montarBase(fontes: FonteProducao[], saude: SaudeParse | null, hoje: DataISO): { linhas: Linha[]; manifesto: ManifestoFonte[]; avisosSaude: string[] };
  export function prodDedupeKey(r: Linha): string;      // mesmos campos e ordem do main.js
  export function applyMotivoEndosso(linhas: Linha[]): void;
  export function applyTrocaSeguradora(linhas: Linha[], hoje: DataISO): void;  // TROCA_DIAS_ANTES=15, TROCA_DIAS_DEPOIS=90
  export const ATIVA_VENCIDA_FOLGA_DIAS = 15, ATIVA_VENCIDA_LIMITE_AVISO = 20;
  export type SaudeParse = { linhas: LinhaSaude[]; avisos: string[]; modificadoEm?: string };
  export function parseSaude(buf: ArrayBuffer): SaudeParse;
  export function aplicarSaude(linhas: Linha[], saude: SaudeParse): void;   // = applySaudeManual
  export type Sinistro = { /* campos de parseClaimsArrayBuffer, com datas em DataISO */ };
  export function montarSinistros(avisados: ArrayBuffer | null, pagamentos: ArrayBuffer | null): { sinistros: Sinistro[]; contagens: { sinistrosAvisados: number; sinistrosPagamentos: number } };
  ```
- **Algoritmo de `aplicarCobertura`:** para cada ano Y presente em mais de uma fonte (pelo ano de `vig`), a fonte com `modificadoEm` mais recente é a dona de Y. Cada outra fonte F perde todas as linhas de Y **se** a dona tiver em Y pelo menos 50% das linhas que F tem em Y. Nesse caso, registra `anosIgnorados` em F. Se tiver menos de 50%, nada é removido e registra `sobreposicoes` nas duas. A ordem das fontes na saída é a mesma da entrada (nome crescente). `montarBase` faz: cobertura → dedup "primeiro vence" na ordem → `applyMotivoEndosso` → `applyTrocaSeguradora` → `aplicarSaude`, nessa ordem, igual a `loadProducaoFromSources`.

- [ ] **Step 1:** Testes de cobertura:
  - (a) A=`producao_2025` (2025, 100 linhas, mais antigo) e B=`producao_2026` (2025: 100 linhas + 2026, mais novo): as linhas de 2025 de A saem, e A fica com `anosIgnorados=[{ano:2025,cobertoPor:'producao_2026.xlsx'}]`;
  - (b) a fixture, em que B tem 1 linha de 2021 e `producao_2021` tem 200: nada sai e `sobreposicoes` aparece nas duas;
  - (c) sem sobreposição, a saída é igual à entrada.
- [ ] **Step 2:** Testes de base:
  - duplicada idêntica entre arquivos conta em `duplicadas` e fica a do primeiro;
  - endosso CN com motivo sobrescreve o motivo da apólice-mãe, valendo o mais recente;
  - a troca de seguradora da fixture marca `trocaSeg` na apólice e no CN;
  - o saúde da fixture recebe prêmio e comissão da planilha;
  - `ativasVencidas` conta apólice `Ativa` com `fim` anterior a `hoje − 15 dias`.
  Testes de sinistros: as contagens por arquivo e a mesclagem igual a `mergeClaimsRows` (linhas 780–802).
- [ ] **Step 3:** Rodar `npm test -- domain`. Esperado: FAIL.
- [ ] **Step 4:** Implementar, portando as linhas 451–802 do `main.js`.
- [ ] **Step 5:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit: `feat(domain): montagem da base, cobertura, enriquecimentos, saúde e sinistros`.

### Task 5: Banco, usuários e escopo

**Files:**
- Create: `web/drizzle.config.ts`, `web/src/server/db/{schema,client,seed}.ts`, `web/src/server/escopo.ts`, `web/tests/server/escopo.test.ts`, `web/seed/usuarios.example.json`
- Modify: `.gitignore` (acrescentar `web/seed/usuarios.json`)

**Interfaces:**
- Produces:
  ```ts
  // schema.ts — tabela users: id serial, email text unique (minúsculas), nome text, role text check in ('admin','gestao','vendedor'), ativo boolean default true, criadoEm timestamptz
  export type Papel = 'admin' | 'gestao' | 'vendedor';
  export function buscarUsuarioAtivo(email: string): Promise<{ email: string; nome: string; role: Papel } | null>;
  // escopo.ts
  export type Escopo = { tipo: 'tudo' } | { tipo: 'nada' };   // Etapa 3 acrescenta { tipo: 'colaboradores'; colabs: string[] }
  export function escopoDoUsuario(u: { role: Papel } | null): Escopo;
  export function aplicarEscopo<T>(linhas: T[], e: Escopo): T[];
  export const podeReprocessar: (u: { role: Papel } | null) => boolean;  // só admin
  ```
- Seed: `npm run db:seed` lê `seed/usuarios.json` (formato do `.example`: `[{ "email": "...", "nome": "...", "role": "admin" }]`) e faz upsert por e-mail. Quem não está no arquivo fica `ativo=false`.

- [ ] **Step 1:** Testes:
  - `escopoDoUsuario({role:'admin'})` e `escopoDoUsuario({role:'gestao'})` dão `{tipo:'tudo'}`;
  - `escopoDoUsuario({role:'vendedor'})` e `escopoDoUsuario(null)` dão `{tipo:'nada'}`;
  - `aplicarEscopo(linhas, {tipo:'nada'})` dá `[]`;
  - `podeReprocessar({role:'gestao'})` é falso.
- [ ] **Step 2:** Rodar `npm test -- escopo`. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Usar `@neondatabase/serverless` + `drizzle-orm`, com `DATABASE_URL` vindo do ambiente. Em teste, usar `pglite` ou um banco local definido em `TEST_DATABASE_URL`, à escolha do implementador.
- [ ] **Step 4:** Teste de integração de `buscarUsuarioAtivo`: o e-mail comparado sem diferenciar maiúsculas e `ativo=false` dando `null`. Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(server): usuários, papéis e escopo`.

### Task 6: Autenticação Microsoft 365

**Files:**
- Create: `web/src/server/auth.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/middleware.ts`, `web/src/app/entrar/page.tsx`, `web/src/app/sem-acesso/page.tsx`, `web/tests/server/auth.test.ts`

**Interfaces:**
- Consumes: `buscarUsuarioAtivo` (Task 5).
- Produces:
  ```ts
  export const { auth, handlers, signIn, signOut } = NextAuth(...);
  export type Sessao = { email: string; nome: string; role: Papel; expiraEm: number };
  export function usuarioDaRequisicao(): Promise<Sessao | null>;  // relê buscarUsuarioAtivo a CADA chamada (Review Focus 5)
  ```
- Provedor `MicrosoftEntraID` com `issuer: https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/v2.0`, escopos `openid profile email offline_access User.Read`. Sessão em JWT com refresh token rotativo (o callback `jwt` renova o access token antes de `expires_at`). Se a renovação falhar, `session.error = 'RefreshFailed'`, que o cliente usa na Task 13.
- `signIn` callback: recusa (manda para `/sem-acesso`) quem não está ativo na tabela.
- `middleware.ts`: rotas do dashboard exigem sessão. `/api/*` responde 401 em JSON em vez de redirecionar.
- Bypass de teste: `PARITY_AUTH_BYPASS=1` só é aceito quando `process.env.VERCEL` está indefinido **e** `NODE_ENV !== 'production'`. Nesse caso, a sessão é `{ email: 'parity@local', role: 'admin' }`. Assert no boot: se `VERCEL` estiver definido e o bypass também, lançar erro.

- [ ] **Step 1:** Testes com o callback `signIn` e `usuarioDaRequisicao` isolados (mock do banco):
  - e-mail ativo com papel `gestao` entra;
  - e-mail inexistente é recusado;
  - usuário ativo que é desativado depois faz `usuarioDaRequisicao()` devolver `null` mesmo com JWT válido;
  - bypass com `VERCEL=1` lança erro.
- [ ] **Step 2:** Rodar `npm test -- auth`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS. Verificação manual (aguarda Mitz, depois da Task 7): login real em `localhost:3000` com a conta do Mitz.
- [ ] **Step 5:** Commit: `feat(server): login Microsoft 365 com lista de autorizados`.

### Task 7: Fontes de arquivos — Graph e pasta local — e passo a passo Azure

**Files:**
- Create: `web/src/server/fontes/{tipos,graph,pasta-local}.ts`, `web/docs/azure-setup.md`, `web/tests/server/fontes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ArquivoMeta = { id: string; nome: string; tag: string /* cTag ou eTag */; modificadoEm: string };
  export interface FonteArquivos {
    listar(): Promise<ArquivoMeta[]>;                // tudo da pasta Dashboard
    baixar(a: ArquivoMeta): Promise<ArrayBuffer>;
  }
  export function isProducaoFileName(nome: string): boolean;   // regra das Global Constraints
  export function criarFonte(): FonteArquivos;   // FONTE=local → PastaLocalFonte(FONTE_DIR); senão GraphFonte
  ```
- `GraphFonte`: token client credentials (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`), mantido em memória até expirar. O resto é igual a `_spGetDriveId`/`_spListProducaoFiles` (linhas 1114–1160 do `main.js`): site `santolinseguros.sharepoint.com` → drive `Santolin` → `root:/Dashboard:/children`.
- `PastaLocalFonte`: `tag` = mtime+size e `modificadoEm` = mtime.

- [ ] **Step 1:** Testes:
  - `isProducaoFileName` aceita `producao_2026.xlsx`, `Produção 2024.XLSX` e `PRODUCAO.xls`, e recusa `~$producao_2026.xlsx` e `sinistrosAvisados.xlsx`;
  - `PastaLocalFonte` sobre a fixture lista 5 arquivos e `baixar` devolve os bytes;
  - `GraphFonte` com `fetch` mockado: 401 no token lança `ErroFonte` com `codigo:'auth'`, e 404 na pasta lança `codigo:'pasta'`.
- [ ] **Step 2:** Rodar `npm test -- fontes`. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `export class ErroFonte extends Error { codigo: 'auth'|'pasta'|'rede'|'http'; status?: number }`.
- [ ] **Step 4:** Escrever `docs/azure-setup.md`, no estilo de `scripts/README.md`: (1) novo registro "Dashboard Web (Next.js)", plataforma Web, redirect `https://<domínio novo>/api/auth/callback/microsoft-entra-id` e `http://localhost:3000/api/auth/callback/microsoft-entra-id`; (2) client secret; (3) permissões delegadas `openid profile email offline_access User.Read`; (4) permissão de aplicativo `Sites.Selected` + consentimento de admin; (5) conceder leitura no site via `POST /sites/{site-id}/permissions` com `roles: ["read"]` (comando PowerShell/Graph Explorer completo); (6) variáveis na Vercel. Marcar no topo: **aguarda Mitz**.
- [ ] **Step 5:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit: `feat(server): fontes Graph e pasta local + passo a passo Azure`.

### Task 8: Ingestão, snapshots e API de fontes

**Files:**
- Create: `web/src/server/{ingestao,snapshots}.ts`, `web/src/app/api/fontes/route.ts`, `web/src/app/api/fontes/reprocessar/route.ts`, `web/tests/server/ingestao.test.ts`

**Interfaces:**
- Consumes: `FonteArquivos` (Task 7), `parseProducao`/`montarBase`/`parseSaude`/`montarSinistros` (Tasks 3–4), `usuarioDaRequisicao`/`podeReprocessar` (Tasks 5–6).
- Produces:
  ```ts
  export type Base = {
    versao: string;                 // hash das tags de todos os arquivos usados
    geradoEm: string; hoje: DataISO;
    linhas: Linha[]; manifesto: ManifestoFonte[]; avisosSaude: string[];
    sinistros: Sinistro[]; contagensSinistros: { sinistrosAvisados: number; sinistrosPagamentos: number };
    avisos: string[];               // ex.: 'sinistrosPagamentos.xlsx: HTTP 500'
    erroProducao?: { mensagem: string; arquivosNaPasta: string[] };
  };
  export function obterBase(opts?: { forcar?: boolean }): Promise<Base>;
  export interface ArmazemSnapshots { ler(chave: string): Promise<Uint8Array | null>; gravar(chave: string, dados: Uint8Array): Promise<void>; apagarTudo(): Promise<void> }
  export function criarArmazem(): ArmazemSnapshots;   // Vercel Blob em produção; diretório .snapshots/ local em dev
  ```
- Snapshot por arquivo: chave `prod/<nome>@<tag>`, com o conteúdo `Linha[]` serializado e gzip. A base montada fica em memória do processo por `versao`.
- **Concorrência (Review Focus 4):** `obterBase` guarda a Promise em andamento por `versao`, e chamadas simultâneas aguardam a mesma. A base só é trocada depois de montada por inteiro. `listar()` é chamado uma vez por montagem e as tags usadas são as dessa listagem. Se `baixar` trouxer conteúdo cuja tag mudou, vale o que foi baixado, e a próxima listagem gera nova `versao`.
- Erros (Review Focus 3): falha de produção preenche `erroProducao` com a mensagem igual à do `main.js` linha ~1308 ("Nenhuma planilha de produção encontrada. Os arquivos devem se chamar producao_<ano>.xlsx (ex.: producao_2021.xlsx). A pasta Dashboard contém: …"), e os sinistros seguem. `ErroFonte` de auth/rede gera `Base` com `erroProducao` e sem sinistros, e o servidor não cai.
- `GET /api/fontes` (logado, papel com escopo ≠ nada) devolve manifesto, contagens, avisos e `geradoEm`. `POST /api/fontes/reprocessar` (só admin, senão 403) faz `apagarTudo()` + `obterBase({forcar:true})`.

- [ ] **Step 1:** Testes com `PastaLocalFonte` + armazém em memória:
  - a primeira chamada parseia 3 arquivos de produção e a segunda, sem mudança, não parseia nenhum (spy em `parseProducao`);
  - mudar o mtime de um arquivo reparseia só ele;
  - duas chamadas `obterBase()` simultâneas fazem só uma montagem;
  - pasta sem `producao*` gera `erroProducao.arquivosNaPasta` com os nomes, e `sinistros.length > 0`;
  - `reprocessar` com `gestao` dá 403.
- [ ] **Step 2:** Rodar `npm test -- ingestao`. Esperado: FAIL.
- [ ] **Step 3:** Implementar. A route `reprocessar` usa `export const maxDuration = 300` (Vercel Pro).
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(server): ingestão com snapshots, concorrência e API de fontes`.

### Task 9: API de dados e decodificação no cliente

**Files:**
- Create: `web/src/app/api/dados/route.ts`, `web/src/domain/serializacao.ts`, `web/src/client/useBase.ts`, `web/tests/domain/serializacao.test.ts`, `web/tests/server/api-dados.test.ts`

**Interfaces:**
- Consumes: `obterBase`, `usuarioDaRequisicao`, `escopoDoUsuario`, `aplicarEscopo`.
- Produces:
  ```ts
  // serializacao.ts — formato colunar: dicionário para colunas de texto repetitivo (seg, ramo, grp, colab, sit, tipo, tipoDoc, motivo, campanha, tipoPessoa)
  export function codificarLinhas(l: Linha[]): LinhasColunares;
  export function decodificarLinhas(c: LinhasColunares): Linha[];
  export function codificarSinistros(s: Sinistro[]): SinistrosColunares;  export function decodificarSinistros(c: SinistrosColunares): Sinistro[];
  // GET /api/dados → { versao, geradoEm, hoje, linhas: LinhasColunares, sinistros: SinistrosColunares, manifesto, contagensSinistros, avisos, avisosSaude, erroProducao? }
  //   ETag = versao + ':' + email; 304 com If-None-Match; Cache-Control: private, no-store para proxies
  // useBase.ts
  export function useBase(): { estado: 'carregando'|'pronto'|'erro'|'sessao-expirada'; base?: BaseCliente; erro?: string; recarregar(): void };
  export type BaseCliente = Omit<Base,'linhas'|'sinistros'> & { linhas: Linha[]; sinistros: Sinistro[] };
  ```
- O escopo é aplicado **antes** de codificar (linhas e sinistros). A Etapa 3 só troca `escopoDoUsuario`.
- `hoje` vem do servidor e o cliente usa esse valor em todos os cálculos. No harness, o servidor obedece `PARITY_HOJE` (só com bypass ativo).

- [ ] **Step 1:** Testes:
  - `decodificarLinhas(codificarLinhas(x))` reproduz `x` em profundidade na fixture;
  - para 150 mil linhas sintéticas, o JSON gzip fica abaixo de 40% do JSON gzip ingênuo (registrar os números no PR);
  - a API sem sessão dá 401;
  - a API com `vendedor` dá 200 com `linhas` vazias e `sinistros` vazios;
  - a API com `gestao` dá todas as linhas;
  - `If-None-Match` igual ao ETag dá 304.
- [ ] **Step 2:** Rodar `npm test -- serializacao api-dados`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: API de dados recortada por escopo e decodificação no cliente`.

### Task 10: Casca do app — layout, tema, cabeçalho, abas, filtros globais, gráfico e Modo TV

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/app/layout.tsx`, `web/src/app/(dash)/layout.tsx`, `web/src/components/{Cabecalho,Abas,FiltrosGlobais,MultiSelect,BotoesTipo,Grafico,Kpi,SecaoRecolhivel,ModoTv,TelaErro}.tsx` (+ `.module.css` de cada), `web/src/client/{filtros,registroGraficos}.ts`, `web/src/domain/filtros.ts`, `web/tests/domain/filtros.test.ts`

**Interfaces:**
- Consumes: `useBase` (Task 9).
- Produces:
  ```ts
  // domain/filtros.ts — porta de applyFilters/populateFilters (main.js 1394–1520)
  export type FiltrosGlobais = { vigIni: DataISO; vigFim: DataISO; emIni: DataISO; emFim: DataISO; tipos: string[]; col: string[]; grp: string[]; ram: string[]; seg: string[] };
  export function filtrarLinhas(l: Linha[], f: FiltrosGlobais): Linha[];          // = FD
  export function opcoesFiltros(l: Linha[], f: FiltrosGlobais): { col: string[]; grp: string[]; ram: string[]; seg: string[] };  // inclui regra de "Colaboradores com produção no período"
  // client/filtros.ts — estado global de filtros compartilhado entre rotas (React context + persistência na URL ?f=)
  export function useFiltros(): { filtros: FiltrosGlobais; definir(p: Partial<FiltrosGlobais>): void; limpar(): void; fd: Linha[] };
  // components/Grafico.tsx
  export function Grafico(p: { id: string; config: ChartConfiguration; altura?: number }): JSX.Element;  // registra window.__charts[id] = { data }
  ```
- Rotas: `/visao-geral`, `/producao`, `/retencao`, `/crosssell`, `/comparativo`, `/metas`, `/sinistros`, `/exibicao-tv`, `/apresentacao`. Cada aba é um `page.tsx` com `dynamic import` do componente da aba, para carregar sob demanda. As abas sem porte ainda mostram "Em migração".
- Cabeçalho com `#dash-subtitle` e `#rec-badge` com o mesmo texto de `updateDashHeader` (linhas 846–868); o link "N arquivos ⚠️" abre o PainelFontes (Task 11). Modo TV: botão `#tv-mode-btn`, `localStorage['tvMode']` e a mesma classe no `body` que `applyTvMode` aplica.
- Tema claro/escuro: portar "Theme Responsiveness" (linhas 171–199 do `main.js`). As cores de eixo, rótulo e grade dos gráficos (`axisClr`/`labelClr`/`gridClr`) viram funções em `client/tema.ts` lidas pelo `Grafico`, que redesenha quando o tema muda.
- `TelaErro` mostra `erroProducao.mensagem`. Não existe upload.
- CSS: portar de `styles.css` as variáveis e regras globais para `tokens.css` e as regras de cada bloco para o `.module.css` do componente, mantendo os nomes de classe originais via `:global(...)` quando isso evitar reescrever os seletores. A paridade visual é conferida por screenshot no Step 4.

- [ ] **Step 1:** Testes de `filtrarLinhas`/`opcoesFiltros` contra os valores esperados da fixture: vigência 2026-01-01..2026-09-30 + tipos `['N','EN']` produz a contagem que o app antigo mostra em `#rec-badge` (tirada do `.golden/producao-tipos.json`).
- [ ] **Step 2:** Rodar `npm test -- filtros`. Esperado: FAIL.
- [ ] **Step 3:** Implementar a casca e os componentes.
- [ ] **Step 4:** `npm run dev` com `FONTE=local FONTE_DIR=parity/fixtures/out PARITY_AUTH_BYPASS=1`: as abas navegam, o cabeçalho mostra `Produção: N (5 arquivos)` e os filtros ficam preenchidos. Tirar screenshots do cabeçalho e dos filtros, lado a lado com o app antigo, e anexar ao PR.
- [ ] **Step 5:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit: `feat(web): casca do app, filtros globais, gráficos e Modo TV`.

### Task 11: Painel de fontes e modelo de saúde

**Files:**
- Create: `web/src/components/PainelFontes.tsx` (+ css), `web/tests/components/PainelFontes.test.tsx`

**Interfaces:**
- Consumes: `BaseCliente.manifesto`, `podeReprocessar`, `POST /api/fontes/reprocessar`.
- Conteúdo igual ao de `openFontesModal` (linhas 870–1004): arquivos, linhas, duplicadas, anos, ativas vencidas com destaque a partir de 20, data de modificação e status da planilha de saúde com os avisos. Novidades: as linhas "<arquivo>: <ano> ignorado, coberto por <dono>" e "sobreposição em <ano> com <arquivo> (<n> linhas)". O botão "Reprocessar fontes" só aparece para admin. "Baixar modelo de saúde" gera o `.xlsx` com as colunas de `SAUDE_MODELO` no cliente, com import dinâmico do `xlsx`.

- [ ] **Step 1:** Testes (Testing Library):
  - o manifesto com `anosIgnorados` mostra exatamente "producao_2025.xlsx: 2025 ignorado, coberto por producao_2026.xlsx";
  - `ativasVencidas: 20` aplica a classe de destaque;
  - o papel `gestao` não vê "Reprocessar fontes".
- [ ] **Step 2:** Rodar o teste. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(web): painel de fontes com regra de cobertura`.

### Task 12: Harness de paridade — lado novo e diff

**Files:**
- Create: `web/parity/{novo,diff}.ts`, `web/tests/parity/diff.test.ts`
- Modify: `web/parity/run.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Cenario`, `CENARIOS` (Task 2).
- Produces:
  ```ts
  export function snapshotNovo(page: Page, baseUrl: string, c: Cenario): Promise<Snapshot>;  // abre /<aba>, aplica os mesmos passos pelos mesmos ids, lê textos de [id] e window.__charts
  export type Diferenca = { cenario: string; tipo: 'texto'|'grafico'|'ausente-no-novo'|'sobra-no-novo'; id: string; antigo?: unknown; novo?: unknown };
  export function compararSnapshots(cenario: string, antigo: Snapshot, novo: Snapshot): Diferenca[];
  ```
- `run.ts --lado ambos` sobe `next start` com `FONTE=local FONTE_DIR=<dataDir> PARITY_AUTH_BYPASS=1 PARITY_HOJE=2026-10-15`, usa `timezoneId America/Sao_Paulo` e o mesmo `clock`. Grava `parity/.golden/relatorio.md` com a tabela de diferenças por cenário e sai com código 1 se houver qualquer diferença. `--abas visao-geral,producao` limita aos cenários dessas abas.
- Regras do diff: números em gráficos são comparados com tolerância `1e-9` absoluta (soma em ordem diferente). Textos são comparados exatamente, já normalizados (espaços colapsados, NBSP → espaço). Ids presentes só no antigo dão `ausente-no-novo`. Ids só no novo são ignorados, a menos que comecem com `ch-`.

- [ ] **Step 1:** Testes de `compararSnapshots`: textos iguais não dão diferença; `'R$ 1.234,50'` com NBSP e com espaço comum são iguais; `0.1+0.2` contra `0.3` em gráfico é igual; label diferente dá `grafico`; id faltando dá `ausente-no-novo`.
- [ ] **Step 2:** Rodar o teste. Esperado: FAIL.
- [ ] **Step 3:** Implementar `diff.ts`, `novo.ts` e a integração no `run.ts`.
- [ ] **Step 4:** Rodar `npm run parity -- --lado ambos --abas visao-geral` com a fixture. Esperado: o relatório lista só `ausente-no-novo` da aba ainda não portada (prova de que o fluxo ponta a ponta funciona) e a saída tem código 1.
- [ ] **Step 4b:** Criar `parity/abas-portadas.ts` (`export const ABAS_PORTADAS: AbaId[] = []`) e a flag `--fixture` (gera a fixture num diretório temporário e roda só os cenários de `ABAS_PORTADAS`). Acrescentar a etapa de paridade ao `regressao` e criar `regressao:real` (`parity -- --lado ambos --dados parity/data`). Rodar `npm run regressao`. Esperado: saída 0 (lista vazia = nada a comparar ainda).
- [ ] **Step 5:** Commit: `test(web): harness de paridade — lado novo e relatório de diferenças`.

### Task 13: Sessão longa e aviso de "entrar novamente"

**Files:**
- Create: `web/src/components/AvisoSessao.tsx`, `web/tests/components/AvisoSessao.test.tsx`
- Modify: `web/src/client/useBase.ts`, `web/src/app/(dash)/layout.tsx`

**Interfaces:**
- `useBase` revalida a cada 5 min (`GET /api/dados` com `If-None-Match`). Se vier 401, ou se `session.error === 'RefreshFailed'`, passa a `estado: 'sessao-expirada'` e **mantém os dados na tela** com o `AvisoSessao` fixo no topo: "Sua sessão expirou — os dados podem estar desatualizados desde HH:MM. [Entrar novamente]". O botão chama `signIn('microsoft-entra-id')`. Com 200 e nova `versao`, a base é trocada sem recarregar a página, preservando filtros e aba (é o caso da TV ligada o dia todo).

- [ ] **Step 1:** Testes com `fetch` mockado:
  - 200 → 304 mantém `pronto`;
  - 200 → 401 vai para `sessao-expirada`, mostra o aviso com o horário da última versão boa e os dados continuam renderizados;
  - 200 → 200 com outra `versao` troca a base e mantém os filtros.
- [ ] **Step 2:** Rodar o teste. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(web): revalidação periódica e aviso de sessão expirada`.

---

## Tasks 14–22: Porte das abas

Todas seguem o **procedimento padrão** abaixo. Cada task só lista o que é específico da aba.

**Procedimento padrão de aba:**
1. **Cenários específicos:** acrescentar em `parity/cenarios.ts` os cenários da aba (listados na task). Rodar `npm run parity -- --lado antigo --abas <aba>` sobre a fixture **e** sobre `parity/data/` real, para gerar os dourados.
2. **Testes de domínio:** criar `tests/domain/<arquivo>.test.ts`, onde o esperado de cada função de domínio vem do dourado da fixture (por exemplo, `expect(kpisProducao(fd).premioTotal).toBe(numeroDoTexto(golden.textos['kpi-premio']))`). Rodar e confirmar FAIL.
3. **Domínio:** portar as funções de cálculo do trecho do `main.js` indicado para `src/domain/<arquivo>.ts` como funções puras `(linhas filtradas, parâmetros da aba, hoje) → objeto de dados`. Nada de DOM. Constantes e comentários de regra de negócio vêm junto, literalmente. Rodar os testes até PASS.
4. **Componentes:** `src/app/(dash)/<aba>/` com o componente da aba e sub-componentes por bloco (KPIs, cada gráfico, cada tabela), reproduzindo os mesmos `id`s, textos e estrutura do `index.html` e dos templates do `main.js`. Estado local da aba (ordenação, paginação, toggles) em `useState`/URL, com os mesmos valores iniciais das variáveis do topo do `main.js`.
5. **Paridade:** `npm run parity -- --lado ambos --abas <aba>` com diferença zero na fixture **e** nos dados reais. Divergência que o `main.js` justifica por bug conhecido não é "consertada": é reproduzida e anotada em `docs/divergencias.md`.
6. **Regressão:** acrescentar a aba em `ABAS_PORTADAS`. Rodar `npm run regressao` (todas as abas já portadas, não só a atual) e `npm run regressao:real`. Esperado: saída 0 nos dois.
7. **Commit:** `feat(web): aba <nome> com paridade`.

### Task 14: Visão geral
- Trecho: `main.js` 1572–1674 (+ "Cancel filter", 388–425). Gráficos: `ch-evolucao`, `ch-cancel`, `ch-seg`, `ch-ramo`. Domínio: `visao-geral.ts`.
- Cenários: `visao-geral-motivo` (um motivo marcado no filtro de cancelamento).

### Task 15: Produção
- Trecho: 1675–1775 (`renderProdKPIs`, `renderProdChart`, `renderProdTable`, `periods`/`PERIOD_COLORS`). Gráfico `ch-prod-line`. Domínio: `producao-aba.ts`.
- Cenários: `producao-metrica-comissao` (rádio de métrica = comissão); `producao-periodos` (dois períodos adicionados); `producao-ordenacao` (clicar no cabeçalho "Prêmio" duas vezes).

### Task 16: Retenção & Churn
- Trecho: 1522–1571 e 1776–2142 (churn evitável, churn do período, KPIs, gráficos, tabela por produtor, detalhe apólice a apólice, exportação). Gráficos `ch-ret-cancel`, `ch-ret-evolucao`. Domínio: `retencao.ts`. Usa `trocaSeg` vindo do servidor.
- Cenários: `retencao-so-evitavel-off` (desmarcar "Só evitável"); `retencao-detalhe-busca` (texto em `retDetailFilter`); `retencao-motivo` (`RET_MS.mot`).
- A exportação da tabela gera o mesmo arquivo. Teste: as linhas e colunas do `.xlsx` exportado são iguais às do antigo (via `page.waitForEvent('download')` nos dois lados).

### Task 17: Cross-sell
- Trecho: 2143–2656 (incluindo Campanha 360, níveis, penetração/oportunidade, tabela paginada `CROSS_PAGE_SIZE=50`). Gráfico `ch-cross-nivel`. Domínio: `crosssell.ts`.
- Cenários: `crosssell-pj` (pessoa PJ); `crosssell-oportunidade` (`crossPenMode`); `crosssell-pagina2`; `crosssell-busca`; `crosssell-ordenacao-ltv-asc`.

### Task 18: Comparativo de períodos
- Trecho: 2923–3665 (período manual, escopo, pivô seguradora/ramo com hierarquia recolhível, KPIs, gráfico, ranking de maiores variações, exportação PDF da aba nas linhas ~3320–3340). Gráfico `ch-comp-main`. Domínio: `comparativo.ts`.
- Cenários: `comparativo-manual` (`comp-start=2026-01-01`, `comp-end=2026-06-30`, clicar "Comparar"); `comparativo-pivo-seg`, `comparativo-pivo-ramo`; `comparativo-metrica` (cada valor de `compMetric`).
- PDF: `html2canvas` e `jspdf` com `import()` dinâmico só no clique. Teste: clicar em exportar dispara o download de um PDF com mais de 0 páginas, e o bundle inicial da rota não contém `html2canvas` (verificar com `next build` + analisar o manifesto da rota).

### Task 19: Metas e Acompanhamento semanal
- Trecho: 3666–4662 menos o modo apresentação (`getMetasBasePeriod`, `filterMetasData`, semanal com equipes geral/pessoais/patrimoniais, tabela por colaborador, cards de equipe). Gráfico `ch-metas-semanal`. Domínio: `metas.ts`, `metas-semanal.ts`.
- Cenários: `metas-equipe-pessoais`, `metas-equipe-patrimoniais`, `metas-metrica-comissao`, `metas-ordenacao`.

### Task 20: Modo apresentação / kickoff
- Trecho: o modo apresentação dentro da seção Metas (a partir da linha ~4391, "Captura cada slide renderizado…"). Rota `/apresentacao`. Domínio: `apresentacao.ts`.
- Cenários: `apresentacao-padrao` com um snapshot por slide (passo `clicar` no avançar até o fim).
- PDF de slides: mesmo carregamento sob demanda da Task 18. Teste: o número de páginas do PDF é igual ao número de slides.

### Task 21: Sinistros & Rentabilidade
- Trecho: 2657–2922 (`recomputeFdClaims`, KPIs, gráficos, sinistralidade e rentabilidade com `sinistralView`/`rentabilView`). Gráficos `ch-sin-evolucao`, `ch-sin-ramo`. Domínio: `sinistros-aba.ts`.
- Cenários: `sinistros-view-ramo` (as duas visões em ramo); `sinistros-so-sinistros` (pasta sem produção, que abre direto na aba Sinistros como em `applySharePointData`).

### Task 22: Exibição TV
- Trecho: 4663–5090 (metas Santolin, pódio, meta mensal de novos, gráfico do ano, níveis com `tvBarValueLabelPlugin`). Gráficos `tv-ex-nivel-chart` e os demais `tv-ex-*`. Rota `/exibicao-tv`. Domínio: `exibicao-tv.ts`. É sempre a carteira inteira, sem filtros de aba.
- Cenários: `exibicao-tv-padrao`, `exibicao-tv-modo-tv` (Modo TV ligado).

---

### Task 23: Deploy do projeto novo e validação final

**Files:**
- Create: `web/README.md` (rodar local, variáveis, `npm run parity`, `db:seed`, deploy)
- Modify: nada fora de `web/`

- [ ] **Step 1 (aguarda Mitz):** O Mitz executa `docs/azure-setup.md` e cria o banco Neon e o Blob store no projeto Vercel novo (Root Directory `web/`, sem domínio de produção). As variáveis são `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`. Não definir `PARITY_*`.
- [ ] **Step 2:** `npm run db:migrate && npm run db:seed` com o `seed/usuarios.json` que o Mitz preencher.
- [ ] **Step 3:** Rodar `npm run parity -- --lado ambos` com todos os cenários sobre `parity/data/` real. Esperado: código 0 e `relatorio.md` sem diferenças. Anexar o relatório ao PR.
- [ ] **Step 4:** No preview da Vercel, o login com a conta do Mitz carrega os dados reais; uma conta do tenant fora da lista cai em `/sem-acesso`; `curl` sem cookie em `/api/dados` dá 401; o deploy do site antigo (projeto existente) continua respondendo igual e `https://<site antigo>/web/package.json` dá 404.
- [ ] **Step 5:** Medir e registrar no PR o tamanho transferido na primeira carga de `/visao-geral` (JS + dados) contra o app antigo (HTML + JS + CDNs + Excel).
- [ ] **Step 6:** Commit: `docs(web): README e checklist de deploy`.

A virada (apontar o domínio para o projeto novo) **não faz parte deste plano**: é decisão do Mitz depois da validação lado a lado.
