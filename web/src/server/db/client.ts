import { neon } from "@neondatabase/serverless";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { atribuicoesHistorico, atribuicoesRenovacao, nomesIgnorados, users, vinculos, vinculosRenovacao, vinculosRenovacaoHistorico, type Papel } from "./schema";
import type { Atribuicao } from "@/domain/atribuicoes";
import type { ChaveVinculoAntiga, VinculoRenovacao } from "@/domain/vinculos-renovacao";

// Aceita neon-http (produção) e pglite (testes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, any>;

let instancia: Db | null = null;

/** Injeta o banco (testes). Passe null para voltar ao padrão. */
export function setDb(db: Db | null): void {
  instancia = db;
}

/** Cria a conexão sob demanda: nada conecta no import. */
export function getDb(): Db {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    instancia = drizzle(neon(url)) as unknown as Db;
  }
  return instancia;
}

export async function buscarUsuarioAtivo(
  email: string,
  db: Db = getDb(),
): Promise<{ email: string; nome: string; role: Papel } | null> {
  const [u] = await db
    .select({ email: users.email, nome: users.nome, role: users.role })
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.ativo, true)))
    .limit(1);
  return u ?? null;
}

export async function nomesDoUsuario(email: string, db: Db = getDb()): Promise<string[]> {
  const r = await db
    .select({ nome: vinculos.nome })
    .from(vinculos)
    .innerJoin(users, eq(users.id, vinculos.userId))
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.ativo, true)));
  return r.map((x) => x.nome).sort();
}

export type UsuarioAdmin = { id: number; email: string; nome: string; role: Papel; ativo: boolean; nomes: string[] };

export async function listarUsuarios(db: Db = getDb()): Promise<UsuarioAdmin[]> {
  const us = await db
    .select({ id: users.id, email: users.email, nome: users.nome, role: users.role, ativo: users.ativo })
    .from(users)
    .orderBy(asc(users.nome));
  const vs = await db.select({ nome: vinculos.nome, userId: vinculos.userId }).from(vinculos);
  return us.map((u) => ({
    ...u,
    nomes: vs.filter((v) => v.userId === u.id).map((v) => v.nome).sort(),
  }));
}

export async function listarIgnorados(db: Db = getDb()): Promise<string[]> {
  const r = await db.select({ nome: nomesIgnorados.nome }).from(nomesIgnorados);
  return r.map((x) => x.nome).sort();
}

export async function salvarUsuario(
  dados: { id?: number; email: string; nome: string; role: Papel; ativo: boolean },
  autor: { id: number; email: string },
  db: Db = getDb(),
): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  const email = dados.email.trim().toLowerCase();
  if (dados.id !== undefined && dados.id === autor.id) {
    if (dados.role !== "admin") return { ok: false, erro: "Você não pode tirar o seu próprio papel de admin." };
    if (!dados.ativo) return { ok: false, erro: "Você não pode desativar o seu próprio usuário." };
    // O login é pelo e-mail: trocar o próprio deixaria o admin trancado fora.
    const [eu] = await db.select({ email: users.email }).from(users).where(eq(users.id, dados.id)).limit(1);
    if (eu && eu.email !== email) return { ok: false, erro: "Você não pode alterar o seu próprio e-mail." };
  }
  const [igual] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (igual && igual.id !== dados.id) return { ok: false, erro: "Já existe um usuário com este e-mail." };
  const campos = { email, nome: dados.nome.trim(), role: dados.role, ativo: dados.ativo, alteradoPor: autor.email, alteradoEm: sql`now()` };
  if (dados.id === undefined) {
    const [novo] = await db.insert(users).values(campos).returning({ id: users.id });
    return { ok: true, id: novo.id };
  }
  const [alt] = await db.update(users).set(campos).where(eq(users.id, dados.id)).returning({ id: users.id });
  if (!alt) return { ok: false, erro: "Usuário não encontrado." };
  return { ok: true, id: alt.id };
}

/**
 * `userId` null desvincula. Um nome pertence a um login só — quem garante é o banco: o upsert só
 * atualiza a linha existente se ela já é deste usuário (sem leitura antes, sem corrida entre admins).
 */
export async function vincularNome(
  nome: string,
  userId: number | null,
  autor: string,
  db: Db = getDb(),
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (userId === null) {
    await db.delete(vinculos).where(eq(vinculos.nome, nome));
    return { ok: true };
  }
  const gravado = await db
    .insert(vinculos)
    .values({ nome, userId, alteradoPor: autor })
    .onConflictDoUpdate({
      target: vinculos.nome,
      set: { alteradoPor: autor, alteradoEm: sql`now()` },
      setWhere: eq(vinculos.userId, userId),
    })
    .returning({ nome: vinculos.nome });
  if (gravado.length) return { ok: true };
  // Nada gravado: o nome é de outro login. Lê o dono só para a mensagem.
  const [dono] = await db
    .select({ nome: users.nome })
    .from(vinculos)
    .innerJoin(users, eq(users.id, vinculos.userId))
    .where(eq(vinculos.nome, nome))
    .limit(1);
  return { ok: false, erro: dono ? `Este nome já está vinculado a ${dono.nome}.` : "O vínculo mudou enquanto salvava. Tente novamente." };
}

export async function ignorarNome(nome: string, ignorar: boolean, autor: string, db: Db = getDb()): Promise<void> {
  if (!ignorar) {
    await db.delete(nomesIgnorados).where(eq(nomesIgnorados.nome, nome));
    return;
  }
  await db.insert(nomesIgnorados).values({ nome, alteradoPor: autor }).onConflictDoNothing({ target: nomesIgnorados.nome });
}

/** Usuários ativos com pelo menos um nome vinculado. `id` distingue logins com o mesmo nome de exibição. */
export async function listarProdutores(db: Db = getDb()): Promise<{ id: number; nome: string; nomes: string[] }[]> {
  return (await listarUsuarios(db)).filter((u) => u.ativo && u.nomes.length > 0).map((u) => ({ id: u.id, nome: u.nome, nomes: u.nomes }));
}

// ---- Atribuições de renovação ----

type ChaveAtrib = { seg: string; apolice: string; fim: string };
const naChave = (k: ChaveAtrib) =>
  and(eq(atribuicoesRenovacao.seg, k.seg), eq(atribuicoesRenovacao.apolice, k.apolice), eq(atribuicoesRenovacao.fim, k.fim));

export async function listarAtribuicoes(db: Db = getDb()): Promise<Atribuicao[]> {
  const rows = await db.select().from(atribuicoesRenovacao).orderBy(asc(atribuicoesRenovacao.fim), asc(atribuicoesRenovacao.apolice));
  return rows.map((r) => ({
    seg: r.seg, apolice: r.apolice, fim: r.fim, para: r.para, de: r.de, por: r.alteradoPor, em: new Date(r.alteradoEm).toISOString(),
  }));
}

/** Cria ou troca a atribuição da vigência e registra no histórico. */
export async function salvarAtribuicao(a: ChaveAtrib & { para: string; de: string }, autor: string, db: Db = getDb()): Promise<void> {
  await db
    .insert(atribuicoesRenovacao)
    .values({ ...a, alteradoPor: autor })
    .onConflictDoUpdate({
      target: [atribuicoesRenovacao.seg, atribuicoesRenovacao.apolice, atribuicoesRenovacao.fim],
      set: { para: a.para, de: a.de, alteradoPor: autor, alteradoEm: sql`now()` },
    });
  await db.insert(atribuicoesHistorico).values({ ...a, acao: "atribuir", por: autor });
}

/** Atribuição em lote: um upsert e um registro de histórico para todas (vigência repetida no lote: vale a última). */
export async function salvarAtribuicoes(lista: (ChaveAtrib & { para: string; de: string })[], autor: string, db: Db = getDb()): Promise<void> {
  const unicas = [...new Map(lista.map((a) => [`${a.seg}|${a.apolice}|${a.fim}`, a])).values()];
  if (!unicas.length) return;
  await db
    .insert(atribuicoesRenovacao)
    .values(unicas.map((a) => ({ ...a, alteradoPor: autor })))
    .onConflictDoUpdate({
      target: [atribuicoesRenovacao.seg, atribuicoesRenovacao.apolice, atribuicoesRenovacao.fim],
      set: { para: sql`excluded.para`, de: sql`excluded.de`, alteradoPor: autor, alteradoEm: sql`now()` },
    });
  await db.insert(atribuicoesHistorico).values(unicas.map((a) => ({ ...a, acao: "atribuir" as const, por: autor })));
}

/** Desfaz (volta ao colaborador da planilha). `false` se não havia atribuição. */
export async function desfazerAtribuicao(k: ChaveAtrib, autor: string, db: Db = getDb()): Promise<boolean> {
  const [apagada] = await db.delete(atribuicoesRenovacao).where(naChave(k)).returning({ de: atribuicoesRenovacao.de });
  if (!apagada) return false;
  await db.insert(atribuicoesHistorico).values({ ...k, acao: "desfazer", para: null, de: apagada.de, por: autor });
  return true;
}

// ---- Vínculos manuais de renovação (spec 2026-11-13) ----

type NovoVinculo = Omit<VinculoRenovacao, "por" | "em">;
const V = vinculosRenovacao;
const paraVinculo = (r: typeof V.$inferSelect): VinculoRenovacao => ({
  seg: r.seg, apolice: r.apolice, fim: r.fim, renSeg: r.renSeg, renApolice: r.renApolice, renVig: r.renVig,
  por: r.alteradoPor, em: new Date(r.alteradoEm).toISOString(),
});
const naAntiga = (k: ChaveVinculoAntiga) => and(eq(V.seg, k.seg), eq(V.apolice, k.apolice), eq(V.fim, k.fim));
const naRen = (v: NovoVinculo) => and(eq(V.renSeg, v.renSeg), eq(V.renApolice, v.renApolice), eq(V.renVig, v.renVig));
const mesmoPar = (a: NovoVinculo, b: NovoVinculo) =>
  a.seg === b.seg && a.apolice === b.apolice && a.fim === b.fim && a.renSeg === b.renSeg && a.renApolice === b.renApolice && a.renVig === b.renVig;
const semAutor = (v: VinculoRenovacao): NovoVinculo =>
  ({ seg: v.seg, apolice: v.apolice, fim: v.fim, renSeg: v.renSeg, renApolice: v.renApolice, renVig: v.renVig });

/** Vários comandos de uma vez: no Neon (neon-http) num `batch`, que é uma transação; sem batch (PGlite dos testes),
 *  em sequência. */
async function emLote(db: Db, comandos: unknown[]): Promise<void> {
  const d = db as unknown as { batch?: (q: unknown[]) => Promise<unknown> };
  if (typeof d.batch === "function") { await d.batch(comandos); return; }
  for (const c of comandos) await c;
}

export async function listarVinculosRenovacao(db: Db = getDb()): Promise<VinculoRenovacao[]> {
  return (await db.select().from(V).orderBy(asc(V.fim), asc(V.apolice))).map(paraVinculo);
}

/** Vincula a R à antiga. Se a antiga já tem outro vínculo ou a R já é de outra antiga: sem `substituir` devolve os
 *  conflitos e não muda nada; com `substituir`, desfaz os conflitantes e grava o novo de uma vez (histórico de tudo).
 *  O mesmo par de novo não muda nada. */
export async function salvarVinculoRenovacao(
  v: NovoVinculo, autor: string, opts: { substituir: boolean }, db: Db = getDb(),
): Promise<{ ok: true; desfeitos: VinculoRenovacao[] } | { ok: false; conflitos: VinculoRenovacao[] }> {
  const existentes = (await db.select().from(V).where(or(naAntiga(v), naRen(v)))).map(paraVinculo);
  if (existentes.some((e) => mesmoPar(semAutor(e), v))) return { ok: true, desfeitos: [] };
  if (existentes.length && !opts.substituir) return { ok: false, conflitos: existentes };
  await emLote(db, [
    ...existentes.map((e) => db.delete(V).where(naAntiga(e))),
    ...(existentes.length ? [db.insert(vinculosRenovacaoHistorico).values(existentes.map((e) => ({ ...semAutor(e), acao: "desfazer" as const, por: autor })))] : []),
    db.insert(V).values({ ...v, alteradoPor: autor }),
    db.insert(vinculosRenovacaoHistorico).values({ ...v, acao: "vincular", por: autor }),
  ]);
  return { ok: true, desfeitos: existentes };
}

/** Desfaz o vínculo da antiga. `false` se não havia. */
export async function desfazerVinculoRenovacao(k: ChaveVinculoAntiga, autor: string, db: Db = getDb()): Promise<boolean> {
  const [apagado] = await db.delete(V).where(naAntiga(k)).returning();
  if (!apagado) return false;
  await db.insert(vinculosRenovacaoHistorico).values({ ...semAutor(paraVinculo(apagado)), acao: "desfazer", por: autor });
  return true;
}
