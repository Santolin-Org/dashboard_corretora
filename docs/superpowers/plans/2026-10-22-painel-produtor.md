# Painel do produtor, barra lateral e vínculos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendedor entra e vê só a própria produção em "Meu painel"; admin/gestão avaliam produtores; admin vincula logins a nomes da planilha; a navegação passa para uma barra lateral.

**Architecture:** Funções puras novas em `web/src/domain/painel-produtor.ts` calculam tudo do painel a partir de `Linha[]` e de um conjunto de nomes. O servidor ganha o escopo `colaboradores` (vínculos no Neon) aplicado antes do envio em `/api/dados`, e regras de rota por papel no `decidirAcesso` do proxy. A UI reaproveita `Grafico` (Chart.js), `tokens.css` e a casca existente, trocando `Abas` por `BarraLateral`.

**Tech Stack:** Next.js 16 App Router (`proxy.ts`, `cacheComponents`), TypeScript strict, Auth.js v5, Drizzle + Neon (pglite nos testes), Chart.js, Vitest + Testing Library, Playwright (paridade).

**Spec:** `docs/superpowers/specs/2026-10-22-painel-produtor-design.md` (esboços aprovados em `.superpowers/brainstorm/24928-1792702487/content/`: `vendedor-layout-v4.html`, `sidebar-v5.html`, `vinculos-v6.html`).

## Global Constraints

- Todos os comandos rodam em `web/`. Antes de qualquer commit: `npm run regressao` verde (lint, typecheck, build, vitest, test:tz, paridade). Nunca afrouxar/pular teste existente; se um teste muda de propósito, dizer no commit.
- Um vendedor nunca recebe linhas de outro: o recorte é no servidor, antes de codificar (`payloadDados`).
- Separador de nomes na coluna COLABORADOR: exatamente `" , "`; cada parte com `trim()`; comparação exata.
- Apólice compartilhada: **valor cheio** para cada vendedor; com vários produtores marcados, a linha conta uma vez.
- Produção do vendedor = regra da aba Produção (`filtrarLinhas` com `tipos: []`, âncora no mês de **vigência**), recortada pelos nomes.
- "A renovar": `isApolice(r)` && `tipo ∈ {N, R}` && `fim` no mês escolhido && `sit ∈ {Ativa, Vencida}`.
- Faixas de urgência e cores: ≤1 `#FF3B3B`, ≤3 `#FF6B4A`, ≤7 `#F5A623`, ≤15 `#d6c23a`, ≤30 `#7fb3ff`, >30 `#3E4D68`, vencida `#7f1d1d`.
- Mês a mês: prêmio `#4E80FF`, comissão `#2DD4A0`, cada série com eixo próprio, valor escrito em cima da barra (formato curto: `48k`, `7,9k`).
- Barras N+R: Novas `#4E80FF` = família N (`N`, `EN`, `CN`); Renovações `#A78BFA` = família R (`R`, `ER`, `CR`); outros tipos → segmento "Outros" só se existir.
- Não tocar em `index.html`/`main.js`/`styles.css` da raiz nem no projeto Vercel `dashboard-corretora`. Paridade das abas existentes: 0 diffs.
- Textos de UI em português, como nos esboços. Nada de segredo em log; e-mail em log só via `mascararEmail`.

## Review Focus

1. Linha com `colab` vazio ou só espaços: não pertence a ninguém (nem vira nome `""` no seletor/coluna "sem dono").
2. Vendedor com vínculo mas zero linhas (novato): painel abre com blocos vazios, sem erro e sem divisão por zero no selo de variação (variação `null` → selo oculto).
3. Mês de dezembro/janeiro na lista "A renovar" e no comparativo anual (virada de ano: `2026-12` → ano anterior `2025-12`; ‹ em janeiro vai para dezembro do ano anterior).
4. Troca de vínculo enquanto o vendedor está logado: o próximo `/api/dados` reflete a mudança (ETag muda porque o escopo entra no hash), sem servir corpo em cache de outro escopo.
5. Admin tentando se rebaixar/desativar, ou vincular um nome já vinculado a outro login: recusado com mensagem, sem estado parcial.

---

### Task 1: Domínio do painel do produtor

**Files:**
- Create: `web/src/domain/painel-produtor.ts`
- Test: `web/tests/domain/painel-produtor.test.ts` (usar `linha()` de `tests/domain/helpers.ts`)

**Interfaces:**
- Consumes: `filtrarLinhas`, `FILTROS_VAZIOS` (`domain/filtros.ts`), `isApolice`, `SIT` (`domain/situacoes.ts`), `Linha`, `DataISO` (`domain/tipos.ts`).
- Produces:
  - `nomesDoColab(colab: string): string[]`
  - `pertenceA(r: Pick<Linha,'colab'>, nomes: ReadonlySet<string>): boolean`
  - `nomesDistintos(linhas: Linha[]): { nome: string; qtd: number }[]` (qtd = linhas em que o nome aparece; ordenado por nome)
  - `type Totais = { premio: number; com: number; qtd: number }`
  - `producaoDoMes(linhas: Linha[], nomes: ReadonlySet<string>, mes: string /* 'YYYY-MM' */): Totais`
  - `type BarraNR = { mes: string; novas: Totais; renov: Totais; outros: Totais; total: Totais }`
  - `comparativoNR(linhas: Linha[], nomes: ReadonlySet<string>, mes: string): { atual: BarraNR; anterior: BarraNR; variacao: number | null }` (variacao = prêmio total atual/anterior − 1; `null` se anterior = 0)
  - `mesAMes(linhas: Linha[], nomes: ReadonlySet<string>, ano: number): { premio: number[]; com: number[] }` (12 posições)
  - `type Faixa = 'vencida' | '1' | '3' | '7' | '15' | '30' | 'neutra'`
  - `faixaUrgencia(dias: number): Faixa` (dias < 0 → vencida; ≤1, ≤3, ≤7, ≤15, ≤30; senão neutra)
  - `type ItemRenovar = { cli: string; ramo: string; seg: string; fim: DataISO; colab: string; apolice: string; dias: number; faixa: Faixa }`
  - `aRenovar(linhas: Linha[], nomes: ReadonlySet<string>, mes: string, hoje: DataISO): { vencidas: ItemRenovar[]; aVencer: ItemRenovar[] }` (ambas por `fim` asc; `vencidas` = `fim < hoje`; `dias` = diferença em dias civis `fim − hoje`)
  - `mesAnterior(mes: string): string`, `mesSeguinte(mes: string): string`, `mesDe(hoje: DataISO): string`
  - `CORES_FAIXA: Record<Faixa, string>` (valores das Global Constraints)

- [ ] **Step 1: Escrever os testes**

```ts
describe('nomes', () => {
  it('separa por " , " com trim; vazio não é nome', () => {
    expect(nomesDoColab('GABRIELA A - SANTOLIN , MATHEUS G - SANTOLIN')).toEqual(['GABRIELA A - SANTOLIN', 'MATHEUS G - SANTOLIN']);
    expect(nomesDoColab('FERNANDO DE PAULA SERAFIM')).toEqual(['FERNANDO DE PAULA SERAFIM']);
    expect(nomesDoColab('   ')).toEqual([]);
  });
  it('pertenceA: dupla pertence aos dois; nome parecido não', () => {
    const s = new Set(['MATHEUS G - SANTOLIN']);
    expect(pertenceA({ colab: 'GABRIELA A - SANTOLIN , MATHEUS G - SANTOLIN' }, s)).toBe(true);
    expect(pertenceA({ colab: 'MATHEUS G - SANTOLIN X' }, s)).toBe(false);
    expect(pertenceA({ colab: '' }, s)).toBe(false);
  });
  it('nomesDistintos conta a dupla para cada nome', () => {
    const l = [linha({ colab: 'A , B' }), linha({ colab: 'A' }), linha({ colab: '' })];
    expect(nomesDistintos(l)).toEqual([{ nome: 'A', qtd: 2 }, { nome: 'B', qtd: 1 }]);
  });
});
describe('produção', () => {
  it('producaoDoMes segue a aba Produção: inclui endosso e cancelamento, só o mês de vigência, só os nomes', () => {
    const l = [
      linha({ colab: 'A', tipo: 'N', vig: '2026-10-05', premio: 100, com: 10 }),
      linha({ colab: 'A', tipo: 'CN', vig: '2026-10-06', premio: -30, com: -3 }),
      linha({ colab: 'A , B', tipo: 'R', vig: '2026-10-31', premio: 50, com: 5 }),
      linha({ colab: 'A', tipo: 'N', vig: '2026-11-01', premio: 999, com: 99 }),
      linha({ colab: 'C', tipo: 'N', vig: '2026-10-10', premio: 777, com: 77 }),
    ];
    expect(producaoDoMes(l, new Set(['A']), '2026-10')).toEqual({ premio: 120, com: 12, qtd: 3 });
    expect(producaoDoMes(l, new Set(['B']), '2026-10')).toEqual({ premio: 50, com: 5, qtd: 1 }); // valor cheio
    expect(producaoDoMes(l, new Set(['A', 'B']), '2026-10').qtd).toBe(3); // dupla conta uma vez
  });
  it('comparativoNR: famílias N/R, total = soma, variação e virada de ano', () => {
    const l = [
      linha({ colab: 'A', tipo: 'N', vig: '2026-01-02', premio: 100, com: 10 }),
      linha({ colab: 'A', tipo: 'ER', vig: '2026-01-03', premio: 20, com: 2 }),
      linha({ colab: 'A', tipo: 'R', vig: '2025-01-09', premio: 60, com: 6 }),
    ];
    const c = comparativoNR(l, new Set(['A']), '2026-01');
    expect(c.atual.novas.premio).toBe(100); expect(c.atual.renov.premio).toBe(20);
    expect(c.atual.total.premio).toBe(120); expect(c.anterior.mes).toBe('2025-01');
    expect(c.variacao).toBeCloseTo(1); // 120/60 − 1
    expect(comparativoNR([], new Set(['A']), '2026-01').variacao).toBeNull();
  });
  it('mesAMes: 12 posições por mês de vigência do ano', () => {
    const r = mesAMes([linha({ colab: 'A', vig: '2026-03-15', premio: 10, com: 1 })], new Set(['A']), 2026);
    expect(r.premio).toHaveLength(12); expect(r.premio[2]).toBe(10); expect(r.com[2]).toBe(1);
  });
});
describe('a renovar', () => {
  const hoje = '2026-10-22';
  const base = { colab: 'A', tipoDoc: 'APÓLICE', endosso: '' };
  const l = [
    linha({ ...base, tipo: 'N', fim: '2026-10-23', sit: 'Ativa', cli: 'amanhã' }),
    linha({ ...base, tipo: 'R', fim: '2026-10-18', sit: 'Vencida', cli: 'venceu' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Renovada', cli: 'renovada' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Cancelada', cli: 'cancelada' }),
    linha({ ...base, tipo: 'EN', fim: '2026-10-25', sit: 'Ativa', cli: 'endosso' }),
    linha({ ...base, tipo: 'N', fim: '2026-10-25', sit: 'Ativa', endosso: '3', cli: 'com endosso' }),
    linha({ ...base, tipo: 'N', fim: '2026-11-02', sit: 'Ativa', cli: 'novembro' }),
    linha({ ...base, colab: 'B', tipo: 'N', fim: '2026-10-24', sit: 'Ativa', cli: 'de outro' }),
  ];
  it('regra da 4.2 e ordenação por fim', () => {
    const r = aRenovar(l, new Set(['A']), '2026-10', hoje);
    expect(r.aVencer.map(i => i.cli)).toEqual(['amanhã']);
    expect(r.vencidas.map(i => [i.cli, i.dias, i.faixa])).toEqual([['venceu', -4, 'vencida']]);
    expect(aRenovar(l, new Set(['A']), '2026-11', hoje).aVencer[0]).toMatchObject({ cli: 'novembro', dias: 11, faixa: '15' });
  });
  it('faixas nas bordas', () => {
    expect([-1, 0, 1, 2, 3, 4, 7, 8, 15, 16, 30, 31].map(faixaUrgencia))
      .toEqual(['vencida', '1', '1', '3', '3', '7', '7', '15', '15', '30', '30', 'neutra']);
  });
  it('navegação de mês na virada de ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12'); expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(mesDe('2026-10-22')).toBe('2026-10');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/domain/painel-produtor.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `web/src/domain/painel-produtor.ts`** com as assinaturas acima. Produção: `filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vigIni: \`${mes}-01\`, vigFim: \`${mes}-31\` })` seguido de `pertenceA` (atenção: `filtrarLinhas` deixa passar linha sem `vig`; aqui exigir `r.vig` não vazio para não contar linha sem data em todo mês). Dias: diferença de datas ISO em UTC (`Date.UTC`), sem fuso local.
- [ ] **Step 4: Rodar** `npx vitest run tests/domain/painel-produtor.test.ts` → PASS; `npm run test:tz` → PASS.
- [ ] **Step 5: Commit** `feat(web): domínio do painel do produtor (produção, N+R, mês a mês, a renovar)`

### Task 2: Banco — vínculos, nomes ignorados e seed só de inclusão

**Files:**
- Modify: `web/src/server/db/schema.ts`, `web/src/server/db/client.ts`, `web/src/server/db/seed.ts`
- Create: migração gerada por `npm run db:generate` em `web/drizzle/`
- Test: `web/tests/server/vinculos.test.ts`, ajustar `web/tests/server/seed.test.ts` (se existir; senão criar)

**Interfaces:**
- Produces (schema):
  - `vinculos`: `nome text primary key`, `userId integer not null references users(id)`, `alteradoPor text not null`, `alteradoEm timestamptz default now()`.
  - `nomesIgnorados`: `nome text primary key`, `alteradoPor text not null`, `alteradoEm timestamptz default now()`.
  - `users` ganha `alteradoPor text` (nullable) e `alteradoEm timestamptz` (nullable).
- Produces (`db/client.ts`, todos aceitam `db: Db = getDb()` por último):
  - `nomesDoUsuario(email: string, db?): Promise<string[]>`
  - `type UsuarioAdmin = { id: number; email: string; nome: string; role: Papel; ativo: boolean; nomes: string[] }`
  - `listarUsuarios(db?): Promise<UsuarioAdmin[]>` (ordenado por nome)
  - `listarIgnorados(db?): Promise<string[]>`
  - `salvarUsuario(dados: { id?: number; email: string; nome: string; role: Papel; ativo: boolean }, autor: { id: number; email: string }, db?): Promise<{ ok: true; id: number } | { ok: false; erro: string }>`
  - `vincularNome(nome: string, userId: number | null, autor: string, db?): Promise<{ ok: true } | { ok: false; erro: string }>` (`null` desvincula)
  - `ignorarNome(nome: string, ignorar: boolean, autor: string, db?): Promise<void>`
  - `listarProdutores(db?): Promise<{ nome: string; nomes: string[] }[]>` (usuários ativos com ≥1 nome)
- Seed: `sincronizarUsuarios` passa a `onConflictDoNothing` e **não desativa** ninguém; `validarSeed` mantém as validações.

- [ ] **Step 1: Testes (pglite, mesmo padrão de `tests/server/auth.test.ts`)**

```ts
it('vincularNome: nome é de um login só', async () => {
  expect(await vincularNome('A - SANTOLIN', ana, 'mitz')).toEqual({ ok: true });
  expect(await vincularNome('A - SANTOLIN', bia, 'mitz')).toEqual({ ok: false, erro: 'Este nome já está vinculado a Ana.' });
  expect(await nomesDoUsuario('ANA@x.com')).toEqual(['A - SANTOLIN']);
  expect(await vincularNome('A - SANTOLIN', null, 'mitz')).toEqual({ ok: true });
  expect(await nomesDoUsuario('ana@x.com')).toEqual([]);
});
it('nomesDoUsuario ignora usuário inativo', async () => { /* ana ativo=false → [] */ });
it('salvarUsuario: e-mail minúsculo, duplicado recusado, admin não se rebaixa nem se desativa', async () => {
  expect(await salvarUsuario({ email: 'Novo@X.com', nome: 'Novo', role: 'vendedor', ativo: true }, adminAutor)).toMatchObject({ ok: true });
  expect(await salvarUsuario({ email: 'novo@x.com', nome: 'N2', role: 'vendedor', ativo: true }, adminAutor)).toEqual({ ok: false, erro: 'Já existe um usuário com este e-mail.' });
  expect(await salvarUsuario({ id: adminAutor.id, email: adminAutor.email, nome: 'M', role: 'gestao', ativo: true }, adminAutor)).toEqual({ ok: false, erro: 'Você não pode tirar o seu próprio papel de admin.' });
  expect(await salvarUsuario({ id: adminAutor.id, email: adminAutor.email, nome: 'M', role: 'admin', ativo: false }, adminAutor)).toEqual({ ok: false, erro: 'Você não pode desativar o seu próprio usuário.' });
});
it('ignorarNome liga e desliga', async () => { /* listarIgnorados reflete */ });
it('seed não desativa nem sobrescreve quem foi editado pela tela', async () => {
  // usuário criado pela tela com papel gestao; seed com lista sem ele e com outro papel para um existente
  // → criado pela tela continua ativo; papel existente não muda
});
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** schema + `npm run db:generate` (commitar o SQL gerado) + funções em `client.ts` + seed. Atualizar o comentário de `seed.ts` ("Upsert…" → "Só inclui; a tela de usuários é a fonte da verdade").
- [ ] **Step 4:** `npx vitest run tests/server` → PASS.
- [ ] **Step 5: Commit** `feat(web): tabelas de vínculos e nomes ignorados; seed só inclui`

### Task 3: Escopo por colaborador, regras de rota e `/api/eu`

**Files:**
- Modify: `web/src/server/escopo.ts`, `web/src/server/corpo-dados.ts`, `web/src/app/api/dados/route.ts`, `web/src/app/api/fontes/route.ts`, `web/src/server/auth-core.ts` (`decidirAcesso`), `web/src/proxy.ts`
- Create: `web/src/app/api/eu/route.ts`
- Test: `web/tests/server/escopo.test.ts` (criar ou estender), `web/tests/server/auth.test.ts`, `web/tests/server/corpo-dados.test.ts` (estender o existente)

**Interfaces:**
- Consumes: `pertenceA` (Task 1), `nomesDoUsuario` (Task 2).
- Produces:
  - `type Escopo = { tipo: 'tudo' } | { tipo: 'nada' } | { tipo: 'colaboradores'; nomes: string[] }` (nomes ordenados)
  - `escopoDoUsuario(u: { role: Papel } | null, nomes?: string[]): Escopo` — admin/gestão → tudo; vendedor com nomes → colaboradores; senão nada.
  - `aplicarEscopo(linhas: Linha[], e: Escopo): Linha[]`
  - `chaveEscopo(e: Escopo): string` (JSON estável; usada no cache do corpo e no ETag)
  - `payloadDados`: sinistros só com `tipo === 'tudo'`; `semAcesso: true` também para `nada`.
  - `/api/dados`: carrega `nomesDoUsuario(u.email)` só se `u.role === 'vendedor'`; ETag = hash de `[versao, hoje, email, chaveEscopo(escopo)]`.
  - `/api/fontes`: 403 para qualquer escopo ≠ `tudo`.
  - `GET /api/eu` → `{ email, nome, role, nomes: string[] }` (nomes só do próprio usuário; 401 sem sessão).
  - `decidirAcesso(pathname, usuario): 'passar' | '401' | '403' | 'entrar' | 'meu-painel'` (regras na ordem; caminho com `..` nunca passa):
    1. Pública → `'passar'`. Sem usuário → API `'401'`, página `'entrar'` (como hoje).
    2. Vendedor: páginas `/` e `/meu-painel` → `'passar'`; qualquer outra página (abas, `/produtores`, `/admin*`, `/apresentacao`, `/exibicao-tv`) → `'meu-painel'`; APIs `/api/dados` e `/api/eu` → `'passar'`; qualquer outra API → `'403'`.
    3. Gestão: `/admin*` e `/api/admin/*` → `'403'`; resto → `'passar'`.
    4. Admin → `'passar'`.
  - `proxy.ts`: `'403'` em API → JSON 403 `{ erro: 'Sem permissão' }`; `'403'` em página → redirect `/visao-geral`; `'meu-painel'` → redirect `/meu-painel`.

- [ ] **Step 1: Testes**

```ts
const L = [linha({ colab: 'A' }), linha({ colab: 'A , B' }), linha({ colab: 'C' }), linha({ colab: '' })];
it('vendedor recebe só linhas com o nome dele, inclusive duplas', () => {
  const e = escopoDoUsuario({ role: 'vendedor' }, ['B']);
  expect(e).toEqual({ tipo: 'colaboradores', nomes: ['B'] });
  expect(aplicarEscopo(L, e).map(r => r.colab)).toEqual(['A , B']);
});
it('vendedor sem vínculo → nada; gestão/admin → tudo', () => {
  expect(escopoDoUsuario({ role: 'vendedor' }, [])).toEqual({ tipo: 'nada' });
  expect(aplicarEscopo(L, escopoDoUsuario({ role: 'gestao' }))).toHaveLength(4);
});
it('payload do vendedor: sem sinistros, sem manifesto, sem avisos', () => {
  const p = payloadDados(baseFake({ sinistros: [sinFake()] }), { tipo: 'colaboradores', nomes: ['A'] });
  expect(p.sinistros).toEqual(codificarSinistros([])); expect(p.manifesto).toEqual([]); expect(p.avisos).toEqual([]);
});
it('cache do corpo separa escopos com nomes diferentes', () => {
  const a = corpoGzip(b, { tipo: 'colaboradores', nomes: ['A'] }), c = corpoGzip(b, { tipo: 'colaboradores', nomes: ['C'] });
  expect(a.equals(c)).toBe(false);
});
it('decidirAcesso por papel', () => {
  const v = { ...sessao, role: 'vendedor' }, g = { ...sessao, role: 'gestao' }, a = { ...sessao, role: 'admin' };
  expect(decidirAcesso('/producao', v)).toBe('meu-painel');
  expect(decidirAcesso('/meu-painel', v)).toBe('passar');
  expect(decidirAcesso('/api/fontes', v)).toBe('403');
  expect(decidirAcesso('/api/produtores', v)).toBe('403');
  expect(decidirAcesso('/api/dados', v)).toBe('passar');
  expect(decidirAcesso('/admin/usuarios', g)).toBe('403');
  expect(decidirAcesso('/api/admin/usuarios', g)).toBe('403');
  expect(decidirAcesso('/api/produtores', g)).toBe('passar');
  expect(decidirAcesso('/admin/usuarios', a)).toBe('passar');
  expect(decidirAcesso('/admin/../producao', v)).not.toBe('passar');
});
```

Também: teste de rota (padrão dos testes de `/api/dados` existentes) — vendedor com vínculo recebe só as linhas dele e ETag diferente de outro vendedor; trocar o vínculo muda o ETag.

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar. Remover o comentário "Etapa 3 acrescenta…" de `escopo.ts`. `TelaSemAcesso` segue existindo até a Task 5.
- [ ] **Step 4:** `npx vitest run tests/server` → PASS.
- [ ] **Step 5: Commit** `feat(web): escopo por colaborador no servidor e regras de rota por papel`

### Task 4: APIs de administração e de produtores

**Files:**
- Create: `web/src/app/api/admin/usuarios/route.ts` (GET, POST), `web/src/app/api/admin/vinculos/route.ts` (PUT), `web/src/app/api/admin/ignorados/route.ts` (PUT), `web/src/app/api/produtores/route.ts` (GET)
- Test: `web/tests/server/api-admin.test.ts`

**Interfaces:**
- Consumes: Task 2 (`listarUsuarios`, `salvarUsuario`, `vincularNome`, `ignorarNome`, `listarIgnorados`, `listarProdutores`), `usuarioDaRequisicao`.
- Produces (JSON):
  - `GET /api/admin/usuarios` → `{ usuarios: UsuarioAdmin[]; ignorados: string[] }`
  - `POST /api/admin/usuarios` body `{ id?, email, nome, role, ativo }` → `{ ok: true, id }` | 400 `{ erro }`
  - `PUT /api/admin/vinculos` body `{ nome: string; userId: number | null }` → `{ ok: true }` | 400 `{ erro }`
  - `PUT /api/admin/ignorados` body `{ nome: string; ignorar: boolean }` → `{ ok: true }`
  - `GET /api/produtores` → `{ produtores: { nome: string; nomes: string[] }[]; ignorados: string[] }`
  - Cada rota revalida o papel no handler (defesa em profundidade além do proxy): admin para `/api/admin/*`, admin/gestão para `/api/produtores`. Corpo inválido → 400. Todas com `Cache-Control: no-store`.

- [ ] **Step 1: Testes** — chamar os handlers com `usuarioDaRequisicao` mockado (vi.mock `@/server/auth`) e pglite: gestão em `/api/admin/usuarios` → 403; vendedor em `/api/produtores` → 403; POST com e-mail sem `@` → 400 `{ erro: 'E-mail inválido.' }`; PUT vínculo duplicado → 400 com a mensagem da Task 2; GET produtores lista só ativos com nome.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web): APIs de usuários, vínculos e produtores`

### Task 5: Barra lateral e casca por papel

**Files:**
- Create: `web/src/components/BarraLateral.tsx`, `web/src/components/BarraLateral.module.css`, `web/src/client/usuario.ts`
- Modify: `web/src/components/Casca.tsx`, `web/src/components/RedirecionarInicio.tsx`, `web/src/components/Abas.tsx` (mantém `ABAS`/`ABAS_PRODUCAO`/`AbaId`; o componente `Abas` sai do uso), `web/src/components/TelaErro.tsx` (remove `TelaSemAcesso`)
- Test: `web/tests/components/barra-lateral.test.tsx`, ajustar `web/tests/components/casca.test.tsx`

**Interfaces:**
- Consumes: `GET /api/eu` (Task 3), `ABAS` (`Abas.tsx`).
- Produces:
  - `useUsuario(): { usuario: { email: string; nome: string; role: Papel; nomes: string[] } | null; carregando: boolean }` (`client/usuario.ts`; uma busca por carga; no bypass de paridade devolve o admin sintético que `/api/eu` já devolve).
  - `itensDaBarra(role: Papel): { grupo: string; itens: { href: string; rotulo: string }[] }[]` (exportada para teste): admin/gestão → grupos "Painéis" (as 7 `ABAS`, mesmas rotas), "Equipe" (`/produtores` "Produtores"), "Exibição" (`/apresentacao` "Apresentação", Exibição TV via `MenuExibicaoTv` existente); admin acrescenta "Admin" (`/admin/usuarios` "Usuários e vínculos"); vendedor → só "Painéis": `/meu-painel` "Meu painel".
  - `<BarraLateral usuario base />`: marca "SANTOLIN / Dashboard", grupos, item ativo por `usePathname` (classe `ativo`, `aria-current="page"`), pé com nome, papel e "Sair" (form com server action `signOut` não é possível em client → link para `/sair` **ou** `POST /api/auth/signout` do Auth.js com CSRF; usar `signOut()` de `next-auth/react`). ☰ abaixo de 900px.
  - Casca: rotas com casca = `ABAS` ∪ `{meu-painel, produtores, admin}`; layout em grid (barra + conteúdo); `Cabecalho` e `FiltrosGlobais` só nas rotas de `ABAS`; Apresentação/Exibição TV continuam sem casca. Vendedor: com `base.semAcesso` renderiza a casca com Meu painel (aviso de sem vínculo vem da Task 6), não mais `TelaSemAcesso`.
  - `RedirecionarInicio`: vendedor → `/meu-painel`; demais como hoje.
  - Os ids/classes que a paridade usa (`#dash`, `#rec-badge`, `#dash-subtitle`, filtros) continuam iguais.

- [ ] **Step 1: Testes**

```tsx
it('itensDaBarra por papel', () => {
  expect(itensDaBarra('vendedor')).toEqual([{ grupo: 'Painéis', itens: [{ href: '/meu-painel', rotulo: 'Meu painel' }] }]);
  expect(itensDaBarra('gestao').map(g => g.grupo)).toEqual(['Painéis', 'Equipe', 'Exibição']);
  expect(itensDaBarra('admin').at(-1)).toEqual({ grupo: 'Admin', itens: [{ href: '/admin/usuarios', rotulo: 'Usuários e vínculos' }] });
});
it('marca o item ativo com aria-current', () => { /* mock usePathname '/producao' → link Produção com aria-current="page" */ });
it('casca não renderiza mais as abas do topo', () => { /* casca.test: sem .nav-tabs; com nav[aria-label="Navegação principal"] */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run tests/components` PASS e `npm run test:parity` PASS (paridade navega por URL; se algum seletor dependia de `.nav-tabs`, ajustar só o lado novo).
- [ ] **Step 5: Commit** `feat(web): barra lateral substitui as abas do topo`

### Task 6: Painel do produtor (Meu painel)

**Files:**
- Create: `web/src/components/painel-produtor/PainelProdutor.tsx` (+ `.module.css`), `BlocoProducaoMes.tsx`, `ListaRenovar.tsx`, `GraficoMesAMes.tsx`; `web/src/app/(dash)/meu-painel/page.tsx`
- Test: `web/tests/components/painel-produtor.test.tsx`

**Interfaces:**
- Consumes: Task 1 (todas), `usePainel` (`base.linhas`, `base.hoje`), `useUsuario` (Task 5), `Grafico` (`components/Grafico.tsx`), `fBRL`/`fN`/`fP` (`domain/formatos.ts`).
- Produces:
  - `<PainelProdutor nomes={ReadonlySet<string>} mostrarDono={boolean} saudacao={string | null} />` — seções 4.1–4.3 da spec; `mostrarDono` acrescenta o nome curto (antes de `" - "`) do colaborador em cada item da lista.
  - `ListaRenovar`: estado do mês começa em `mesDe(base.hoje)`; botões ‹ › com `aria-label` "Mês anterior"/"Próximo mês"; selo "atual" só no mês corrente; grupo de vencidas com botão "minimizar"/"mostrar" (`aria-expanded`), estado em `localStorage['painelProdutor:vencidasMin']` (try/catch); título "A renovar · {n} em {mês}"; vazio: "Nenhuma apólice a renovar em {mês}.".
  - Selo de prazo: `dias === 1` "amanhã", `0` "hoje", `>1` "em {d} dias", `<0` "venceu há {|d|} dia(s)".
  - `BlocoProducaoMes`: 3 números (Apólices = `qtd`, Prêmio líquido, Comissão), barras horizontais empilhadas `{mês}/{ano-1}` e `{mês}/{ano}` via `Grafico` (Chart.js `indexAxis: 'y'`, stacked), rótulos "N R$ …"/"R R$ …" desenhados por plugin inline `afterDatasetsDraw`; "Total R$ … · comissão R$ …" abaixo; selo "▲/▼ x,x% sobre {mês}/{ano-1}" oculto se `variacao === null`.
  - `GraficoMesAMes`: barras agrupadas, dois eixos y (`y` prêmio, `y1` comissão, eixo y1 oculto), rótulo curto em cima de cada barra (plugin inline), tooltip com `fBRL`; meses futuros sem barra.
  - Página `/meu-painel`: `PainelProdutor` com `nomes = new Set(usuario.nomes)`, `saudacao = "Olá, {primeiro nome}"`; vendedor sem nomes → aviso exato "Seu login ainda não está ligado a um nome da planilha. Fale com o administrador." e nenhum bloco; admin/gestão que abrirem `/meu-painel` veem os próprios nomes (podem estar vazios → mesmo aviso).
  - Abaixo de 900px as duas metades empilham.

- [ ] **Step 1: Testes (RTL, `base` fake via `ContextoPainel`)** — lista mostra só o mês atual por padrão e "‹" muda para o mês anterior; vencidas minimizadas somem e o botão alterna `aria-expanded`; selo "amanhã"/"venceu há 4 dias"; selo de variação oculto sem ano anterior; aviso de sem vínculo com `nomes` vazio; `mostrarDono` mostra "GABRIELA ALENCAR MOZERLE" num item da dupla.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + conferência visual em `npm run dev` (`PARITY_AUTH_BYPASS=1`) com a fixture, comparando com `vendedor-layout-v4.html`.
- [ ] **Step 5: Commit** `feat(web): Meu painel do produtor`

### Task 7: Página Produtores (admin e gestão)

**Files:**
- Create: `web/src/app/(dash)/produtores/page.tsx`, `web/src/components/painel-produtor/SeletorProdutores.tsx` (+ css)
- Test: `web/tests/components/produtores.test.tsx`

**Interfaces:**
- Consumes: `GET /api/produtores` (Task 4), `nomesDistintos` (Task 1), `PainelProdutor` (Task 6), `base.linhas`.
- Produces:
  - `opcoesSeletor(produtores: { nome: string; nomes: string[] }[], distintos: { nome: string; qtd: number }[], ignorados: string[]): { pessoas: { id: string; rotulo: string; nomes: string[] }[]; semDono: { id: string; rotulo: string; nomes: string[] }[] }` (exportada; `id` = `p:{nome}` / `n:{nome}`; sem dono = distintos não vinculados e não ignorados).
  - `<SeletorProdutores>`: busca + caixas de marcar em dois grupos ("Pessoas", "Nomes sem dono"), etiquetas removíveis "{rótulo} ×"; seleção em `localStorage['produtores:selecao']` (ids; try/catch; ids que não existem mais são descartados).
  - Página: sem seleção → "Escolha um ou mais produtores."; com seleção → `PainelProdutor` com a união dos nomes e `mostrarDono` quando a seleção tiver mais de um nome.

- [ ] **Step 1: Testes** — `opcoesSeletor` separa pessoas e sem dono e exclui ignorados e vinculados; marcar dois produtores com uma apólice em dupla soma sem duplicar (Apólices = contagem única); remover etiqueta desmarca; seleção restaurada do localStorage e id inexistente descartado.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(web): página Produtores com seletor`

### Task 8: Tela Usuários e vínculos (admin)

**Files:**
- Create: `web/src/app/(dash)/admin/usuarios/page.tsx`, `web/src/components/admin/UsuariosVinculos.tsx` (+ css)
- Test: `web/tests/components/usuarios-vinculos.test.tsx`

**Interfaces:**
- Consumes: Task 4 APIs, `nomesDistintos` (Task 1), `base.linhas`, `useUsuario`.
- Produces: tela do esboço `vinculos-v6.html`:
  - tabela (nome + e-mail, papel com selo, nomes como etiquetas "× " e botão "+ nome" com busca entre os nomes distintos sem dono); login sem nome → "⚠ sem vínculo — vê o painel vazio" (só para vendedor);
  - "+ Novo usuário" e "Editar" num formulário (e-mail, nome, papel, ativo) → `POST /api/admin/usuarios`; erro da API aparece no formulário;
  - coluna "Nomes sem dono · {n}" com quantidade de apólices; clique abre a escolha de login; ação "não é pessoa"/"desfazer" → `PUT /api/admin/ignorados`;
  - após cada ação, recarrega `GET /api/admin/usuarios`; nenhuma atualização otimista que esconda erro.
  - Página: `useUsuario().usuario.role !== 'admin'` → não renderiza nada (o proxy já bloqueia).

- [ ] **Step 1: Testes (fetch mockado)** — lista renderiza etiquetas e aviso de sem vínculo; "+ nome" chama `PUT /api/admin/vinculos` com `{ nome, userId }`; erro 400 aparece no formulário; "não é pessoa" tira o nome da coluna após recarregar.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(web): tela de usuários e vínculos`

### Task 9: Fechamento — regressão, documentação e verificação real

**Files:**
- Modify: `web/README.md` (seção de usuários: tela no lugar do seed; seed só inclui), `web/docs/pendencias.md` (marcar "ETag full escopo" resolvido; acrescentar "comparar mês parcial até o mesmo dia"), `docs/superpowers/specs/2026-10-20-migracao-nextjs-design.md` §5.4 (nota curta apontando para a nova spec)

- [ ] **Step 1:** `npm run regressao` → tudo verde.
- [ ] **Step 2:** com dados reais (`PARITY_DADOS=~/Documents/dashboard-planilhas-paridade npm run regressao:real`) → 0 diffs.
- [ ] **Step 3:** verificação manual no `npm run dev` local: admin vê barra completa; simular vendedor (bypass não serve: usar teste de rota da Task 3 como prova; anotar no PR que o teste real com login de vendedor é feito pelo Mitz no preview).
- [ ] **Step 4: Commit** `docs: painel do produtor, vínculos e pendências`
