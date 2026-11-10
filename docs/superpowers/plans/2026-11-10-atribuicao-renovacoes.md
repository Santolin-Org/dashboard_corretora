# Atribuição de renovações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestor atribui, apólice por apólice, quem cuida da renovação; a atribuição fica no banco e vale nas abas Renovações, Metas, Comparativo e no "A renovar" do painel do produtor, com aviso de divergência.

**Architecture:** Uma função pura de domínio (`aplicarAtribuicoes`) marca, nas linhas da base, o responsável efetivo (`resp`) da vigência atribuída (apólice + endossos) e da renovação ligada a ela, e o tipo efetivo das linhas da base (N→R, EN→ER). O cliente busca as atribuições em `/api/atribuicoes`, aplica uma vez na Casca e entrega `base.linhas` já marcadas; só as quatro telas da lista leem `resp`/`tipoEfetivo`. No servidor, a mesma função amplia o escopo do vendedor para receber as apólices atribuídas a ele.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Drizzle + Neon (PGlite nos testes), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-10-atribuicao-renovacoes-design.md`

## Global Constraints

- Todo código de app fica em `web/`; nunca mexer em `index.html`/`main.js`/`styles.css` da raiz.
- `npm run regressao` (em `web/`) verde antes de cada commit de fim de tarefa que toque `src/` e antes do PR; nunca apagar/pular/afrouxar teste.
- Dados reais (nomes de clientes, valores) nunca em teste, fixture, commit ou PR — usar nomes e números fictícios.
- Migração no Neon de produção só com OK explícito do Mitz (o plano gera a migração; não a aplica em produção).
- Escrita (PUT/DELETE) só `gestao` e `admin`; vendedor só lê o que é dele.
- Abas fora da lista (Produção, Visão geral, Retenção, Cross-sell, Exibição TV, Apresentação) não mudam; a paridade (`npm run parity -- --lado ambos --fixture`) segue com 0 diferenças.
- Textos de UI em português.

## Review Focus

1. Mesmo número de apólice na renovação (seguradora que mantém o número): a atribuição da vigência antiga não pode marcar a R nova pela chave — só pela ligação. → teste na Task 1.
2. Atribuição cujo `fim` não bate com nenhuma linha (planilha reexportada mudou a data): ignorada sem erro, e não some do banco. → teste na Task 1.
3. Atribuir de volta ao colaborador original (para = colab da planilha): equivale a não ter atribuição para fins de cálculo (sem divergência fantasma). → teste na Task 1.
4. Banco fora do ar: `/api/atribuicoes` 503 → o cliente segue sem atribuições e mostra aviso; `/api/dados` do vendedor 503 (nunca escopo maior). → testes nas Tasks 3 e 4.
5. Vendedor A não recebe linhas atribuídas ao vendedor B. → teste na Task 3.

---

### Task 1: Domínio — `aplicarAtribuicoes`

**Files:**
- Create: `web/src/domain/atribuicoes.ts`
- Modify: `web/src/domain/tipos.ts` (campos opcionais em `Linha`)
- Test: `web/tests/domain/atribuicoes.test.ts`

**Interfaces:**
- Consumes: `ligarRenovacoes(antigas, todas)` de `renovacoes.ts`; `isApolice`, `chaveApolice` de `situacoes.ts`.
- Produces:
  - Em `Linha`: `resp?: string` (responsável efetivo), `atrib?: 'base' | 'renovacao'`, `tipoEfetivo?: string`, `divergente?: boolean`.
  - `type Atribuicao = { seg: string; apolice: string; fim: DataISO; para: string; de: string; por: string; em: string }`
  - `chaveAtribuicao(a: { seg: string; apolice: string; fim: DataISO }): string` → `` `${seg}|${apolice}|${fim}` ``
  - `type Divergencia = { antiga: Linha; renovacao: Linha; para: string }`
  - `aplicarAtribuicoes(linhas: Linha[], atribs: Atribuicao[]): { linhas: Linha[]; divergencias: Divergencia[] }` — devolve array novo; só as linhas afetadas são copiadas (as outras mantêm a identidade).
  - `respDe(r: Linha): string` → `r.resp ?? r.colab`
  - `tipoMetaDe(r: Linha): string` → `r.tipoEfetivo ?? r.tipo`

Regras (do spec): a apólice antiga é a linha `isApolice` com `seg`, `apolice` e `fim` iguais aos da atribuição; as linhas da **base** são ela e os endossos de mesmo `seg|apolice` com `vig` em `[antiga.vig, antiga.fim)`. Recebem `resp = para`, `atrib = 'base'`, e `tipoEfetivo` = `'R'` se tipo N, `'ER'` se EN (R/ER mantêm). A **renovação** é a R ligada por `ligarRenovacoes([antiga], linhas)`; ela e seus endossos (mesmo `seg|apolice`, `vig` em `[R.vig, R.fim)`) recebem `resp = para`, `atrib = 'renovacao'`; se `R.colab !== para`, `divergente = true` em todas as linhas da renovação e entra em `divergencias`. Atribuição com `para === antiga.colab`: nenhuma marca.

- [ ] **Step 1: Testes** (`linha()` de `tests/domain/helpers.ts`, nomes fictícios ANA/BIA/CAIO):
  - `marca a vigência atribuída e seus endossos, não a vigência anterior da mesma apólice` — apólice A1 com duas vigências (2024→2025 e 2025→2026), endosso EN dentro da segunda; atribuir fim 2026 a BIA → só a 2ª vigência e o EN têm `resp: 'BIA'`, `atrib: 'base'`; `tipoEfetivo` 'R' na N e 'ER' no EN.
  - `marca a renovação ligada (CPF/CNPJ + ramo + vigência) e o ER dela` → `resp: 'BIA'`, `atrib: 'renovacao'`.
  - `seguradora que mantém o número: a R nova com a mesma apólice só é marcada como renovacao, nunca como base`.
  - `divergência quando a R saiu no nome de outro` → `divergencias` com 1 item, `divergente: true`; sem divergência quando a R está no nome de `para`.
  - `atribuição sem linha correspondente é ignorada` → linhas idênticas por identidade (`toBe`), `divergencias` vazio.
  - `para igual ao colaborador da planilha não marca nada`.
  - `respDe e tipoMetaDe caem para colab e tipo sem atribuição`.
- [ ] **Step 2:** `npx vitest run tests/domain/atribuicoes.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar. Índice por `seg|apolice` para não varrer a base por atribuição (a base tem ~150 mil linhas).
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(web): domínio de atribuição de renovações`.

### Task 2: Banco — tabela, histórico e funções

**Files:**
- Modify: `web/src/server/db/schema.ts`, `web/src/server/db/client.ts`
- Create: `web/drizzle/0002_*.sql` (via `npm run db:generate`)
- Test: `web/tests/server/atribuicoes-db.test.ts`

**Interfaces:**
- Produces:
  - Tabela `atribuicoes_renovacao`: `seg text`, `apolice text`, `fim text` (ISO), PK composta (seg, apolice, fim); `para text not null`, `de text not null`, `alterado_por text not null`, `alterado_em timestamptz default now()`.
  - Tabela `atribuicoes_historico`: `id serial pk`, `seg`, `apolice`, `fim`, `acao text check in ('atribuir','desfazer')`, `para text null`, `de text not null`, `por text not null`, `em timestamptz default now()`.
  - `listarAtribuicoes(db?): Promise<Atribuicao[]>`
  - `salvarAtribuicao(a: { seg; apolice; fim; para; de }, autor: string, db?): Promise<void>` — upsert + linha de histórico `atribuir`.
  - `desfazerAtribuicao(k: { seg; apolice; fim }, autor: string, db?): Promise<boolean>` — apaga + histórico `desfazer`; `false` se não existia.

- [ ] **Step 1: Testes** (padrão PGlite de `tests/server/vinculos.test.ts`): salvar → listar devolve com `por`/`em`; salvar de novo na mesma chave troca `para` (upsert) e o histórico tem 2 linhas `atribuir`; desfazer → some da lista, histórico `desfazer`, retorna `true`; desfazer de novo → `false`.
- [ ] **Step 2:** FAIL. **Step 3:** schema + `npm run db:generate` + funções. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): tabelas de atribuição de renovações`. Não rodar `db:migrate` contra o Neon.

### Task 3: API `/api/atribuicoes` e escopo do vendedor

**Files:**
- Create: `web/src/app/api/atribuicoes/route.ts`
- Modify: `web/src/server/auth-core.ts` (`APIS_VENDEDOR` += `/api/atribuicoes`), `web/src/server/escopo.ts`, `web/src/app/api/dados/route.ts`
- Test: `web/tests/server/api-atribuicoes.test.ts`, acréscimos em `tests/server/escopo.test.ts`, `tests/server/api-dados.test.ts`, `tests/server/auth.test.ts`

**Interfaces:**
- `GET` → `{ atribuicoes: Atribuicao[] }`. gestão/admin: todas. Vendedor: só as com `para` ou `de` entre os nomes dele (`nomesDoUsuario`). Banco fora → 503.
- `PUT` body `{ seg, apolice, fim, para, de }` (strings não vazias, `fim` ISO `AAAA-MM-DD`) → `{ ok: true }`; só gestão/admin (`exigirPapel`); 400 em corpo inválido.
- `DELETE` body `{ seg, apolice, fim }` → `{ ok: true }` ou 404 se não existia.
- `Escopo` colaboradores ganha `atribuicoes: Atribuicao[]` (as que têm `para` entre os nomes); `escopoDoUsuario(u, nomes, atribs = [])` filtra; `aplicarEscopo` passa as linhas por `aplicarAtribuicoes` e inclui as com `resp` entre os nomes além das de `pertenceA`; devolve as linhas **originais** (sem as marcas — o cliente aplica). `chaveEscopo` inclui as chaves `chaveAtribuicao` ordenadas (muda ETag e cache quando muda a atribuição).
- `/api/dados`: para vendedor, carrega `listarAtribuicoes()` junto com os nomes (mesmo try → 503).

- [ ] **Step 1: Testes:** papéis (vendedor PUT → 403; sem sessão → 401); validação (fim inválido → 400); vendedor GET só vê as dele; escopo: vendedor BIA recebe a apólice da ANA atribuída a ela e **não** recebe a atribuída a CAIO; `chaveEscopo` muda ao incluir atribuição; `/api/dados` vendedor com banco fora → 503; `decidirAcesso('/api/atribuicoes', vendedor)` → `passar`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): API de atribuições e escopo do vendedor`.

### Task 4: Cliente — buscar, aplicar e expor

**Files:**
- Create: `web/src/client/atribuicoes.ts`
- Modify: `web/src/client/painel.ts`, `web/src/components/Casca.tsx`
- Test: `web/tests/client/atribuicoes.test.tsx`

**Interfaces:**
- `useAtribuicoes(ativo: boolean): { atribuicoes: Atribuicao[]; erro: boolean; salvar(a): Promise<void>; desfazer(k): Promise<void> }` — GET ao montar (quando há base); `salvar`/`desfazer` chamam PUT/DELETE e atualizam a lista local sem recarregar `/api/dados`.
- `ValorPainel` ganha `atribuicoes: Atribuicao[]`, `divergencias: Divergencia[]`, `atribuicoesErro: boolean`, `salvarAtribuicao`, `desfazerAtribuicao`.
- Na Casca: `const aplicada = useMemo(() => aplicarAtribuicoes(base.linhas, atribuicoes), …)` e o contexto entrega `base: { ...base, linhas: aplicada.linhas }`. Erro no GET → lista vazia + `atribuicoesErro`.

- [ ] **Step 1: Testes** (fetch mockado): aplica ao carregar (linha com `resp`); `salvar` faz PUT com o corpo certo e a linha passa a ter `resp` sem novo GET de `/api/dados`; GET 503 → `atribuicoesErro` e linhas sem marca.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(web): atribuições aplicadas na base do cliente`.

### Task 5: Aba Renovações — responsável efetivo, ação na linha e divergências

**Files:**
- Modify: `web/src/domain/renovacoes.ts`, `web/src/app/(dash)/renovacoes/Renovacoes.tsx`, `Renovacoes.module.css`
- Create: `web/src/app/(dash)/renovacoes/AtribuirResponsavel.tsx`
- Test: `tests/domain/renovacoes.test.ts`, `tests/components/renovacoes.test.tsx`

**Interfaces:**
- Filtro de colaborador de `chegaramParaRenovar` e `renovacoesDoPeriodo` usa `respDe(r)`.
- `ItemRenovacao` ganha `divergente: boolean` (da antiga atribuída cuja R ligada está `divergente`).
- `filtrarSituacaoRenov` aceita também `'divergente'`.
- UI: coluna Colaborador mostra `nomeCurto(respDe(antiga))` e, se `atrib`, selo "atribuída" com tooltip "Na planilha: <colab>". Para gestão/admin (`useUsuario`), cada linha tem botão "Atribuir" que abre `AtribuirResponsavel` (select com os colaboradores de `opcoesFiltros(...).col` de todas as linhas + "Voltar ao original" quando atribuída) e chama `salvarAtribuicao({ seg, apolice, fim, para, de: antiga.colab })` / `desfazerAtribuicao`. Com divergências no período, aviso no topo: "N renovações saíram no nome de outro colaborador" + botão que liga o filtro `divergente`; linha com selo "divergente" (tooltip: "R no nome de X; atribuída a Y"). Vendedor não vê ação nem aviso.

- [ ] **Step 1: Testes:** domínio — com filtro col=BIA, a antiga atribuída de ANA→BIA conta em "chegaram" da BIA e não da ANA; a R emitida por CAIO e ligada a ela conta em "renovações" da BIA. Tela — gestão vê "Atribuir", escolhe BIA → `salvarAtribuicao` chamado com `{ seg, apolice, fim, para: 'BIA', de: 'ANA' }`; aviso de divergência com contagem e filtro; vendedor não vê o botão.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(web): atribuir responsável e divergências na aba Renovações`.

### Task 6: Metas, Comparativo e "A renovar"

**Files:**
- Modify: `web/src/domain/metas.ts` (`filtrarMetas`, `getMetasRealizadoData`, `buildMetasGroupData`, `buildMetasEquipeCards`, exportações), `web/src/domain/comparativo.ts` (`criarEscopo`), `web/src/domain/painel-produtor.ts` (`aRenovar`)
- Test: `tests/domain/metas.test.ts`, `tests/domain/comparativo.test.ts`, `tests/domain/painel-produtor.test.ts`

**Interfaces:**
- Metas: filtro e agrupamento por colaborador usam `respDe(r)`; `metaTipoSide(tipoMetaDe(r))` no lugar de `metaTipoSide(r.tipo)`, e o filtro de botões de tipo compara `tipoMetaDe(r)`.
- Comparativo: em `criarEscopo`, `col.has(respDe(r))`.
- `aRenovar`: `pertenceA({ colab: respDe(r) }, nomes)`.

- [ ] **Step 1: Testes:** Metas — N de 2025 da ANA atribuída a BIA: com col=BIA entra em `rp` (renovações) da BIA, não em `np`; com col=ANA não entra; tabela por colaborador tem BIA com o valor. Comparativo — `dadosComp` com col=BIA tem a linha atribuída em `anterior` e a R ligada em `atual`. A renovar — BIA vê a apólice atribuída, ANA não. Sem atribuições, todos os testes existentes passam sem mudança.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(web): atribuições valem em Metas, Comparativo e A renovar`.

### Task 7: Documentação e regressão final

**Files:** `METRICAS.md` (§6.2 ganha "Atribuição de renovações"), `web/README.md` se houver seção de banco/migrações.

- [ ] **Step 1:** Documentar regra, chave (seg + apólice + fim), divergência, onde vale e onde não vale, e que a migração `0002` precisa ser aplicada no Neon antes de publicar.
- [ ] **Step 2:** `cd web && npm run regressao` → EXIT 0 (paridade 0 diferenças em 111 cenários).
- [ ] **Step 3:** Commit `docs: atribuição de renovações`.
- [ ] **Step 4:** PR. O merge só depois de o Mitz autorizar **e** de a migração estar aplicada no Neon de produção (com o OK dele).
