import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { aplicarEscopo, escopoDoUsuario, podeReprocessar } from "@/server/escopo";
import { buscarUsuarioAtivo, setDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { sincronizarUsuarios } from "@/server/db/seed";

describe("escopoDoUsuario", () => {
  it("admin e gestao veem tudo", () => {
    expect(escopoDoUsuario({ role: "admin" })).toEqual({ tipo: "tudo" });
    expect(escopoDoUsuario({ role: "gestao" })).toEqual({ tipo: "tudo" });
  });
  it("vendedor e usuário ausente não recebem nada", () => {
    expect(escopoDoUsuario({ role: "vendedor" })).toEqual({ tipo: "nada" });
    expect(escopoDoUsuario(null)).toEqual({ tipo: "nada" });
  });
  it("aplicarEscopo", () => {
    expect(aplicarEscopo([1, 2], { tipo: "nada" })).toEqual([]);
    expect(aplicarEscopo([1, 2], { tipo: "tudo" })).toEqual([1, 2]);
  });
  it("só admin reprocessa", () => {
    expect(podeReprocessar({ role: "admin" })).toBe(true);
    expect(podeReprocessar({ role: "gestao" })).toBe(false);
    expect(podeReprocessar({ role: "vendedor" })).toBe(false);
    expect(podeReprocessar(null)).toBe(false);
  });
});

describe("usuários no banco (pglite)", () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    setDb(db);
  });
  beforeEach(async () => {
    await db.delete(users);
  });

  it("compara e-mail sem diferenciar maiúsculas", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "gestao" });
    expect(await buscarUsuarioAtivo("ANA@Exemplo.com.BR")).toEqual({
      email: "ana@exemplo.com.br", nome: "Ana", role: "gestao",
    });
    expect(await buscarUsuarioAtivo("outra@exemplo.com.br")).toBeNull();
  });

  it("ativo=false dá null", async () => {
    await db.insert(users).values({ email: "x@exemplo.com.br", nome: "X", role: "admin", ativo: false });
    expect(await buscarUsuarioAtivo("x@exemplo.com.br")).toBeNull();
  });

  it("papel inválido é rejeitado pelo check", async () => {
    await expect(
      pg.query(`insert into users (email, nome, role) values ('z@e.com','Z','root')`),
    ).rejects.toThrow();
  });

  it("seed faz upsert por e-mail minúsculo e desativa ausentes", async () => {
    await sincronizarUsuarios(db, [
      { email: "A@exemplo.com.br", nome: "A", role: "admin" },
      { email: "b@exemplo.com.br", nome: "B", role: "vendedor" },
    ]);
    await sincronizarUsuarios(db, [
      { email: "a@exemplo.com.br", nome: "A2", role: "admin" },
      { email: "c@exemplo.com.br", nome: "C", role: "gestao" },
    ]);
    expect(await buscarUsuarioAtivo("a@exemplo.com.br")).toEqual({
      email: "a@exemplo.com.br", nome: "A2", role: "admin",
    });
    expect(await buscarUsuarioAtivo("b@exemplo.com.br")).toBeNull();
    // reativa quem volta ao arquivo
    await sincronizarUsuarios(db, [
      { email: "b@exemplo.com.br", nome: "B", role: "vendedor" },
      { email: "d@exemplo.com.br", nome: "D", role: "admin" },
    ]);
    expect(await buscarUsuarioAtivo("b@exemplo.com.br")).not.toBeNull();
    expect(await buscarUsuarioAtivo("a@exemplo.com.br")).toBeNull();
  });

  it("recusa lista vazia, sem admin e e-mails duplicados, sem tocar no banco", async () => {
    await sincronizarUsuarios(db, [{ email: "a@exemplo.com.br", nome: "A", role: "admin" }]);
    await expect(sincronizarUsuarios(db, [])).rejects.toThrow(/vazia/);
    await expect(
      sincronizarUsuarios(db, [{ email: "b@exemplo.com.br", nome: "B", role: "gestao" }]),
    ).rejects.toThrow(/admin/);
    await expect(
      sincronizarUsuarios(db, [
        { email: "a@exemplo.com.br", nome: "A", role: "admin" },
        { email: " A@Exemplo.com.br", nome: "A", role: "admin" },
      ]),
    ).rejects.toThrow(/duplicado: a@exemplo.com.br/);
    expect(await buscarUsuarioAtivo("a@exemplo.com.br")).not.toBeNull();
  });
});
