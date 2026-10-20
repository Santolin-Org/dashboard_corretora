import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { Db } from "./client";
import { users, type Papel } from "./schema";

export type UsuarioSeed = { email: string; nome: string; role: Papel };

const PAPEIS: Papel[] = ["admin", "gestao", "vendedor"];

export function validarSeed(dados: unknown): UsuarioSeed[] {
  if (!Array.isArray(dados)) throw new Error("seed: esperado um array");
  if (dados.length === 0) throw new Error("seed: lista vazia (desativaria todos os usuários)");
  const lista = dados.map((d, i) => {
    const { email, nome, role } = (d ?? {}) as Record<string, unknown>;
    if (typeof email !== "string" || !email.includes("@")) throw new Error(`seed[${i}]: e-mail inválido`);
    if (typeof nome !== "string" || !nome) throw new Error(`seed[${i}]: nome inválido`);
    if (!PAPEIS.includes(role as Papel)) throw new Error(`seed[${i}]: papel inválido`);
    return { email: email.trim().toLowerCase(), nome, role: role as Papel };
  });
  const vistos = new Set<string>();
  for (const u of lista) {
    if (vistos.has(u.email)) throw new Error(`seed: e-mail duplicado: ${u.email}`);
    vistos.add(u.email);
  }
  if (!lista.some((u) => u.role === "admin")) throw new Error("seed: nenhum admin na lista");
  return lista;
}

/** Upsert por e-mail minúsculo; quem não está na lista fica ativo=false. */
export async function sincronizarUsuarios(db: Db, lista: UsuarioSeed[]): Promise<void> {
  const norm = validarSeed(lista);
  for (const u of norm) {
    await db
      .insert(users)
      .values({ ...u, ativo: true })
      .onConflictDoUpdate({
        target: users.email,
        set: { nome: u.nome, role: u.role, ativo: true },
      });
  }
  const emails = norm.map((u) => u.email);
  await db.update(users).set({ ativo: false }).where(notInArray(users.email, emails));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const arquivo = resolve(process.cwd(), "seed/usuarios.json");
  const lista = validarSeed(JSON.parse(readFileSync(arquivo, "utf8")));
  const db = drizzle(neon(url)) as unknown as Db;
  await sincronizarUsuarios(db, lista);
  console.log(`seed: ${lista.length} usuário(s) sincronizado(s)`);
}

if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
