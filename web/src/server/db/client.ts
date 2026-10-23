import { neon } from "@neondatabase/serverless";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { nomesIgnorados, users, vinculos, type Papel } from "./schema";

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

/** `userId` null desvincula. Um nome pertence a um login só. */
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
  const [dono] = await db
    .select({ userId: vinculos.userId, nome: users.nome })
    .from(vinculos)
    .innerJoin(users, eq(users.id, vinculos.userId))
    .where(eq(vinculos.nome, nome))
    .limit(1);
  if (dono && dono.userId !== userId) return { ok: false, erro: `Este nome já está vinculado a ${dono.nome}.` };
  await db
    .insert(vinculos)
    .values({ nome, userId, alteradoPor: autor })
    .onConflictDoUpdate({ target: vinculos.nome, set: { userId, alteradoPor: autor, alteradoEm: sql`now()` } });
  return { ok: true };
}

export async function ignorarNome(nome: string, ignorar: boolean, autor: string, db: Db = getDb()): Promise<void> {
  if (!ignorar) {
    await db.delete(nomesIgnorados).where(eq(nomesIgnorados.nome, nome));
    return;
  }
  await db.insert(nomesIgnorados).values({ nome, alteradoPor: autor }).onConflictDoNothing({ target: nomesIgnorados.nome });
}

/** Usuários ativos com pelo menos um nome vinculado. */
export async function listarProdutores(db: Db = getDb()): Promise<{ nome: string; nomes: string[] }[]> {
  return (await listarUsuarios(db)).filter((u) => u.ativo && u.nomes.length > 0).map((u) => ({ nome: u.nome, nomes: u.nomes }));
}
