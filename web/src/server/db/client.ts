import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users, type Papel } from "./schema";

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
