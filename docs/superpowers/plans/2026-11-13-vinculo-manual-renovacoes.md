# Vínculo manual de renovações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gestão vincula à mão, na aba Renovações, uma R lançada em outro nome à apólice que venceu, e o dash passa a tratar o par como ligado.

**Architecture:** Vínculos ficam numa tabela nova do Neon e chegam ao cliente por `/api/vinculos-renovacao`, como as atribuições. O domínio aplica os pares manuais dentro de `ligarRenovacoes` antes da ligação automática; todo chamador (aba Renovações, `aplicarAtribuicoes`, recorte do vendedor no servidor) passa a mesma lista. A tela ganha os diálogos A/B, o alerta de conflito e a etiqueta "renovada como".

**Tech Stack:** Next.js 16, TypeScript, Drizzle (neon-http em produção, PGlite nos testes), Vitest + Testing Library, Playwright (paridade).

**Spec:** `docs/superpowers/specs/2026-11-13-vinculo-manual-renovacoes-design.md`

## Global Constraints

- Tudo em `web/`. Não tocar no app antigo (raiz) nem no projeto Vercel `dashboard-corretora`.
- Só papéis `gestao` e `admin` gravam; `vendedor` só lê.
- Só R (tipo `R`, `isApolice`, fora `SIT_FORA_RENOVACOES`) pode ser renovação vinculada; início da R ≤ fim da antiga + **90 dias** (sem limite antes do fim).
- A ligação automática não muda (±1 dia, CPF/CNPJ + ramo).
- O nome exibido continua o da antiga; etiqueta exata: `renovada como <cli da R>` (só quando `cli` difere).
- Textos de tela: botão A `Vincular renovação`; botão B `Vincular à apólice anterior`; `Desfazer vínculo`; aviso pós-substituição `Vínculo desfeito na apólice <nº>` com link.
- Fixtures só com dados sintéticos. `npm run regressao` verde antes de commit final/PR. Migração em produção só com OK do Mitz.
- O nome `vinculos` já existe (nome→usuário). Tudo novo usa `vinculoRenovacao`/`vinculos_renovacao`.

## Review Focus

- Vínculo cuja antiga ou R sumiu da planilha (reprocessamento): ignorado sem quebrar a tela nem a contagem. → teste no Task 1.
- R já ligada automaticamente a outra antiga e escolhida no vínculo manual: o manual vence, a outra antiga fica sem renovação. → teste no Task 1.
- Duas vigências seguidas (a R vinculada é também antiga do ano seguinte com atribuição própria): atribuição não sobrescreve a marca `base`. → teste no Task 1.
- Substituição sem `substituir: true` nunca apaga nada; com ele, apaga e grava num único comando (falha não deixa estado meio-feito). → testes no Task 2.
- Vendedor com antiga atribuída e R vinculada em nome de outro colaborador recebe a R em `/api/dados`, e o ETag muda quando o vínculo muda. → teste no Task 4.

---

### Task 1: Domínio — pares manuais na ligação

**Files:**
- Create: `web/src/domain/vinculos-renovacao.ts`
- Modify: `web/src/domain/renovacoes.ts` (`ItemRenovacao`, `ligarRenovacoes`, `dadosRenovacoes`)
- Modify: `web/src/domain/atribuicoes.ts` (`aplicarAtribuicoes`)
- Test: `web/tests/domain/vinculos-renovacao.test.ts`, `web/tests/domain/atribuicoes.test.ts`

**Interfaces:**
- Produces (em `vinculos-renovacao.ts`):
  - `type ChaveVinculoAntiga = { seg: string; apolice: string; fim: DataISO }`
  - `type VinculoRenovacao = ChaveVinculoAntiga & { renSeg: string; renApolice: string; renVig: DataISO; por: string; em: string }`
  - `chaveVinculoAntiga(v: ChaveVinculoAntiga): string` → `seg|apolice|fim`; `chaveVinculoRen(v: {renSeg;renApolice;renVig}): string` → `renSeg|renApolice|renVig`
  - `JANELA_VINCULO_DIAS = 90`; `dentroDaJanela(fimAntiga: DataISO, vigRen: DataISO): boolean`
  - `sugestoesRenovacao(antiga: Linha, livres: Linha[], termo: string): Linha[]` e `sugestoesAntiga(ren: Linha, livres: Linha[], termo: string): Linha[]` — filtram pela janela, aplicam a busca (mesma regra de `casa` em renovacoes.ts: nome, CPF/CNPJ com ou sem pontuação, nº da apólice), ordenam: mesma seguradora e ramo primeiro, depois `|vig(R) − fim(antiga)|` crescente, depois cliente.
- Produces (em `renovacoes.ts`):
  - `ItemRenovacao` ganha `manual: boolean`.
  - `ligarRenovacoes(antigas: Linha[], todas: Linha[], vinculos: VinculoRenovacao[] = [])`.
  - `dadosRenovacoes(linhas, f, hoje, vinculos: VinculoRenovacao[] = [])` devolve também `livres: { renovacoes: Linha[]; antigas: Linha[] }` (base inteira: R candidatas sem antiga ligada; `candidatasRenovacao` sem renovação ligada).
- Produces (em `atribuicoes.ts`): `aplicarAtribuicoes(linhas, atribs, vinculos: VinculoRenovacao[] = [])`.

- [ ] **Step 1: Testes que falham** (`tests/domain/vinculos-renovacao.test.ts`, com `linha()` de `./helpers`)
  - `par manual liga antiga e R de CPFs diferentes`: antiga A (doc 111, fim 2026-11-15), R B (doc 222, vig 2026-11-14) + vínculo → item de A tem `renovacao === B`, `manual === true`, situação `renovada`; `dadosRenovacoes(...).outros` não contém B; `cards.renovacoes.premio` inclui o prêmio de B.
  - `manual vence o automático`: R B casa automaticamente com antiga C (mesmo doc/ramo, ±1 dia) e está vinculada à mão a A → A fica com B (`manual`), C fica sem renovação.
  - `vínculo com linha sumida é ignorado`: vínculo para apólice inexistente → mesmo resultado de sem vínculo, sem exceção.
  - `vínculo fora da janela é ignorado`: R com vig = fim + 91 → não liga; fim + 90 → liga.
  - `livres`: R ligada (auto ou manual) não aparece em `livres.renovacoes`; antiga ligada não aparece em `livres.antigas`.
  - `sugestões`: mesma seguradora+ramo antes; depois mais próxima; busca por `123.456` acha doc `123456`; R fora da janela nunca aparece.
  - Em `tests/domain/atribuicoes.test.ts`: `atribuição segue a R vinculada à mão` (antiga atribuída a BIA, R em outro doc vinculada → R com `resp: 'BIA'`, `atrib: 'renovacao'`); `vigências seguidas: a R vinculada que é antiga atribuída mantém a marca base`.
- [ ] **Step 2:** `cd web && npx vitest run tests/domain/vinculos-renovacao.test.ts tests/domain/atribuicoes.test.ts` → FAIL (módulo/assinatura inexistente).
- [ ] **Step 3: Implementar.** Em `ligarRenovacoes`, antes de montar `pares`: para cada vínculo, achar a antiga (em `antigas`, por `seg|apolice` + `fim`, `isApolice`) e a R (em `todas`, tipo R, `isApolice`, `seg|apolice` + `vig`), checar `dentroDaJanela`; fixar `ligada.set(i, r)`, `usadas.add(r)`, marcar `manual`. A disputa automática pula antigas já fixadas e R já usadas. `aplicarAtribuicoes` só repassa `vinculos` ao seu `ligarRenovacoes`.
- [ ] **Step 4:** mesmo comando → PASS; `npx vitest run tests/domain` → tudo verde.
- [ ] **Step 5: Commit** `feat(web): vínculo manual de renovações no domínio`.

### Task 2: Banco — tabela, migração 0003 e funções

**Files:**
- Modify: `web/src/server/db/schema.ts`; Create: `web/drizzle/0003_*.sql` + meta (via `npx drizzle-kit generate`)
- Modify: `web/src/server/db/client.ts`
- Test: `web/tests/server/vinculos-renovacao-db.test.ts` (PGlite + `migrate`, como `atribuicoes-db.test.ts`)

**Interfaces:**
- Consumes: `VinculoRenovacao`, `ChaveVinculoAntiga` (Task 1).
- Produces:
  - Tabela `vinculos_renovacao` (`seg, apolice, fim` PK; `ren_seg, ren_apolice, ren_vig` com unique; `alterado_por`, `alterado_em`) e `vinculos_renovacao_historico` (`id serial`, chaves da antiga e da R, `acao: 'vincular' | 'desfazer'`, `por`, `em`).
  - `listarVinculosRenovacao(db?): Promise<VinculoRenovacao[]>`
  - `salvarVinculoRenovacao(v: Omit<VinculoRenovacao,'por'|'em'>, autor: string, opts: { substituir: boolean }, db?): Promise<{ ok: true; desfeitos: VinculoRenovacao[] } | { ok: false; conflitos: VinculoRenovacao[] }>`
  - `desfazerVinculoRenovacao(k: ChaveVinculoAntiga, autor: string, db?): Promise<boolean>`

- [ ] **Step 1: Testes que falham**: salvar→listar com autor/data; `conflito na antiga` (antiga já vinculada a R1, salvar com R2 sem substituir → `ok:false`, `conflitos` = [vínculo R1], banco intacto); `conflito na R` (R já usada por outra antiga); `substituir` (desfaz o(s) conflitante(s), grava o novo, `desfeitos` lista os removidos, histórico: `desfazer` para cada removido + `vincular`); mesmo par de novo → `ok:true`, `desfeitos: []`; `desfazer` devolve true/false e grava histórico.
- [ ] **Step 2:** `npx vitest run tests/server/vinculos-renovacao-db.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Schema + `npx drizzle-kit generate` (conferir que o SQL só cria as duas tabelas). Em `salvarVinculoRenovacao`: ler conflitos (mesma antiga com R diferente, ou mesma R com antiga diferente); sem `substituir` e com conflitos → `ok:false`. Com `substituir`: um único comando SQL com CTEs (`with apagados as (delete … returning …), hist as (insert into …_historico select … from apagados), novo as (insert … on conflict do nothing)`), para ser atômico tanto no neon-http (sem transação interativa) quanto no PGlite; depois o insert de histórico `vincular`.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(web): tabela e funções de vínculos de renovação`.

### Task 3: API `/api/vinculos-renovacao`

**Files:**
- Create: `web/src/app/api/vinculos-renovacao/route.ts`
- Test: `web/tests/server/api-vinculos-renovacao.test.ts` (padrão de `api-atribuicoes.test.ts`)

**Interfaces:**
- Consumes: funções do Task 2; `dentroDaJanela` (Task 1); helpers de `@/server/api-admin`, `bypassAtivo`.
- Produces:
  - `GET` → `{ vinculos: VinculoRenovacao[] }` para gestao/admin/vendedor (bypass → `[]`; banco fora → `indisponivel()`).
  - `PUT` corpo `{ seg, apolice, fim, renSeg, renApolice, renVig, substituir?: boolean }` → 200 `{ ok: true, desfeitos }`; 409 `{ erro, conflitos }`; 400 se faltar campo, data não ISO ou fora da janela (`"A renovação precisa começar até 90 dias depois do fim da apólice anterior."`).
  - `DELETE` corpo `{ seg, apolice, fim }` → 200 / 404 `{ erro: "Vínculo não encontrado." }`.

- [ ] **Step 1: Testes que falham**: vendedor PUT/DELETE → 403; vendedor GET → 200; validação (campo faltando, fim+91 → 400); conflito → 409 com `conflitos`; `substituir:true` → 200 com `desfeitos`; DELETE inexistente → 404; banco lançando → 503 de `indisponivel`.
- [ ] **Step 2:** `npx vitest run tests/server/api-vinculos-renovacao.test.ts` → FAIL.
- [ ] **Step 3: Implementar** seguindo `api/atribuicoes/route.ts`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(web): API de vínculos de renovação`.

### Task 4: Recorte do vendedor no servidor

**Files:**
- Modify: `web/src/server/escopo.ts`, `web/src/app/api/dados/route.ts`
- Test: `web/tests/server/escopo.test.ts`, `web/tests/server/api-dados.test.ts`

**Interfaces:**
- Consumes: `aplicarAtribuicoes(linhas, atribs, vinculos)` (Task 1), `listarVinculosRenovacao` (Task 2).
- Produces: `escopoDoUsuario(u, nomes, atribs, vinculos: VinculoRenovacao[] = [])`; o escopo `colaboradores` ganha `vinculos?` (só quando há atribuições minhas e vínculos); `aplicarEscopo` repassa; `chaveEscopo` inclui `vinculos` como `chaveVinculoAntiga>chaveVinculoRen` ordenados.

- [ ] **Step 1: Testes que falham**: `escopo.test.ts` — vendedor com antiga atribuída a ele e R de outro doc/colaborador vinculada recebe a R; sem o vínculo não recebe; `chaveEscopo` muda quando o vínculo muda. `api-dados.test.ts` — rota lê `listarVinculosRenovacao` para vendedor (mock) e o ETag muda com ele.
- [ ] **Step 2:** `npx vitest run tests/server/escopo.test.ts tests/server/api-dados.test.ts` → FAIL.
- [ ] **Step 3: Implementar**; em `dados/route.ts` buscar os vínculos no mesmo `Promise.all` das atribuições (só para vendedor).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(web): vínculos de renovação no recorte do vendedor`.

### Task 5: Cliente — hook e Casca

**Files:**
- Create: `web/src/client/vinculos-renovacao.ts`
- Modify: `web/src/client/atribuicoes.ts` (`comAtribuicoes(base, atribs, vinculos = [])`), `web/src/client/painel.ts`, `web/src/components/Casca.tsx`
- Test: `web/tests/client/vinculos-renovacao.test.tsx`, `web/tests/components/casca.test.tsx`

**Interfaces:**
- Produces:
  - `useVinculosRenovacao(ativo: boolean, sinal?: unknown): EstadoVinculos` com `{ vinculos; erro; vincular(v: NovoVinculo, substituir?: boolean): Promise<ResultadoVinculo>; desfazer(k: ChaveVinculoAntiga): Promise<void> }`.
  - `type NovoVinculo = Omit<VinculoRenovacao, 'por' | 'em'>`; `type ResultadoVinculo = { ok: true; desfeitos: VinculoRenovacao[] } | { ok: false; conflitos: VinculoRenovacao[] }` (409 vira `ok:false`, outros erros lançam `Error` com a mensagem da API).
  - `ValorPainel` ganha `vinculosRenovacao?`, `vinculosErro?`, `vincularRenovacao?`, `desfazerVinculoRenovacao?`; helper `vinculosDoPainel(v)` com padrões (lista vazia; escrita rejeita), como `atribuicoesDoPainel`.
  - Casca aplica `comAtribuicoes(base, atrib.atribuicoes, vinc.vinculos)`.

- [ ] **Step 1: Testes que falham**: hook — GET popula; `vincular` com 409 devolve `ok:false` sem mudar a lista; com 200 troca a lista local (remove `desfeitos`, adiciona o novo); `desfazer` remove. Casca — atribuição + vínculo marcam a R vinculada (`resp`) na base entregue às abas.
- [ ] **Step 2:** `npx vitest run tests/client/vinculos-renovacao.test.tsx tests/components/casca.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** no molde de `useAtribuicoes`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(web): vínculos de renovação no cliente`.

### Task 6: Tela — diálogos, alerta, etiqueta e desfazer

**Files:**
- Create: `web/src/app/(dash)/renovacoes/VincularRenovacao.tsx` (diálogo único para A e B, `role="dialog"`)
- Modify: `web/src/app/(dash)/renovacoes/Renovacoes.tsx` e o CSS do módulo
- Test: `web/tests/components/renovacoes.test.tsx`

**Interfaces:**
- Consumes: `dadosRenovacoes(..., vinculos)` com `livres` e `manual` (Task 1); `sugestoesRenovacao`/`sugestoesAntiga`; `vinculosDoPainel` (Task 5).
- Comportamento (spec "Tela"): A na antiga sem renovação; B na R de "Outros vencimentos" sem antiga; só gestão/admin. Escolher + "Vincular" → `vincular(v)`; se `ok:false`, `window.confirm` com `Esta apólice já está vinculada a <cli> (apólice <nº>). Desfazer esse vínculo e vincular a esta?` (um texto por conflito); OK → `vincular(v, true)`; depois mostrar `Vínculo desfeito na apólice <nº>` por desfeito, com link (botão) que põe o nº da apólice na busca da lista e volta para "Todas". Linha vinculada: etiqueta `renovada como <cli>` quando `cli` difere; `Desfazer vínculo` só em `manual` e só gestão. Erro → mensagem na tela.

- [ ] **Step 1: Testes que falham**: vendedor não vê botões; gestor vê A só em antiga sem renovação e B só em outro vencimento sem antiga; diálogo A lista sugestões na ordem esperada e grava com o par certo; diálogo B idem; conflito → `confirm` chamado com o texto; cancelar não chama segunda vez; OK chama `vincular(v, true)` e mostra o aviso com link que filtra a lista; etiqueta aparece só com cliente diferente; `Desfazer vínculo` chama `desfazer` e não aparece em ligação automática.
- [ ] **Step 2:** `npx vitest run tests/components/renovacoes.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** seguindo o esboço aprovado.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(web): vincular renovações na aba Renovações`.

### Task 7: Documentação, regressão e verificação

**Files:** `METRICAS.md` (§6.2: vínculo manual e janela de 90 dias), `web/README.md` (migração 0003 primeiro no dev).

- [ ] **Step 1:** atualizar a documentação.
- [ ] **Step 2:** `cd web && npm run regressao` → tudo verde (paridade 0/111).
- [ ] **Step 3:** verificação no navegador com o dev server local (gestor no bypass local; vínculo, conflito, desfazer).
- [ ] **Step 4: Commit** `docs: vínculo manual de renovações` e PR para `main`, avisando que a migração 0003 precisa rodar (dev primeiro; produção com OK do Mitz) antes do deploy.
