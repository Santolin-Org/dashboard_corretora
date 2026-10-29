import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sincronizarUsuarios, validarSeed } from "@/server/db/seed";
import { users } from "@/server/db/schema";

const pg = new PGlite();
const db = drizzle(pg);
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
beforeEach(async () => {
  await db.delete(users);
});

describe("seed só de inclusão", () => {
  it("não desativa nem sobrescreve quem foi editado pela tela", async () => {
    await db.insert(users).values([
      { email: "tela@x.com", nome: "Criado na tela", role: "gestao" },
      { email: "ana@x.com", nome: "Ana Editada", role: "gestao", ativo: false },
    ]);
    await sincronizarUsuarios(db, [
      { email: "adm@x.com", nome: "Adm", role: "admin" },
      { email: "Ana@x.com", nome: "Ana", role: "vendedor" },
    ]);
    const r = await pg.query<{ email: string; nome: string; role: string; ativo: boolean }>(
      `select email, nome, role, ativo from users order by email`,
    );
    expect(r.rows).toEqual([
      { email: "adm@x.com", nome: "Adm", role: "admin", ativo: true },
      { email: "ana@x.com", nome: "Ana Editada", role: "gestao", ativo: false },
      { email: "tela@x.com", nome: "Criado na tela", role: "gestao", ativo: true },
    ]);
  });
  it("validarSeed mantém as validações", () => {
    expect(() => validarSeed([])).toThrow();
    expect(() => validarSeed([{ email: "a@x.com", nome: "A", role: "vendedor" }])).toThrow(/admin/);
    expect(() => validarSeed([{ email: "a@x.com", nome: "A", role: "x" }])).toThrow(/papel/);
  });
});
