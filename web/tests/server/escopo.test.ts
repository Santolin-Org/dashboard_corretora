import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { aplicarEscopo, chaveEscopo, escopoDoUsuario, podeReprocessar } from "@/server/escopo";
import { linha } from "../domain/helpers";
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
  // Mudou de propósito: aplicarEscopo agora recebe Linha[] (o recorte por colaborador lê `colab`).
  it("aplicarEscopo: nada → vazio; tudo → as mesmas linhas", () => {
    const ls = [linha({ colab: "A" }), linha({ colab: "B" })];
    expect(aplicarEscopo(ls, { tipo: "nada" })).toEqual([]);
    expect(aplicarEscopo(ls, { tipo: "tudo" })).toEqual(ls);
  });
  it("só admin reprocessa", () => {
    expect(podeReprocessar({ role: "admin" })).toBe(true);
    expect(podeReprocessar({ role: "gestao" })).toBe(false);
    expect(podeReprocessar({ role: "vendedor" })).toBe(false);
    expect(podeReprocessar(null)).toBe(false);
  });
});

describe("escopo por colaborador", () => {
  const L = [linha({ colab: "A" }), linha({ colab: "A , B" }), linha({ colab: "C" }), linha({ colab: "" })];
  it("vendedor recebe só linhas com o nome dele, inclusive duplas", () => {
    const e = escopoDoUsuario({ role: "vendedor" }, ["B"]);
    expect(e).toEqual({ tipo: "colaboradores", nomes: ["B"] });
    expect(aplicarEscopo(L, e).map((r) => r.colab)).toEqual(["A , B"]);
  });
  it("vendedor sem vínculo → nada; gestão/admin → tudo", () => {
    expect(escopoDoUsuario({ role: "vendedor" }, [])).toEqual({ tipo: "nada" });
    expect(escopoDoUsuario({ role: "vendedor" })).toEqual({ tipo: "nada" });
    expect(aplicarEscopo(L, escopoDoUsuario({ role: "gestao" }))).toHaveLength(4);
    expect(escopoDoUsuario({ role: "admin" }, ["A"])).toEqual({ tipo: "tudo" });
    expect(escopoDoUsuario(null, ["A"])).toEqual({ tipo: "nada" });
  });
  it("nomes ordenados e sem vazios; linha com colab vazio não pertence a ninguém", () => {
    expect(escopoDoUsuario({ role: "vendedor" }, ["C", "A", ""])).toEqual({ tipo: "colaboradores", nomes: ["A", "C"] });
    expect(escopoDoUsuario({ role: "vendedor" }, ["", "  "])).toEqual({ tipo: "nada" });
    expect(aplicarEscopo([linha({ colab: "" }), linha({ colab: "   " })], { tipo: "colaboradores", nomes: [""] })).toEqual([]);
  });
  it("comparação exata (sem prefixo/maiúsculas)", () => {
    const e = escopoDoUsuario({ role: "vendedor" }, ["ANA"]);
    expect(aplicarEscopo([linha({ colab: "ANA CLARA" }), linha({ colab: "ana" }), linha({ colab: "BIA , ANA" })], e).map((r) => r.colab)).toEqual(["BIA , ANA"]);
  });
  it("chaveEscopo é estável e distingue nomes", () => {
    expect(chaveEscopo({ tipo: "colaboradores", nomes: ["B", "A"] })).toBe(chaveEscopo({ tipo: "colaboradores", nomes: ["A", "B"] }));
    expect(chaveEscopo({ tipo: "colaboradores", nomes: ["A"] })).not.toBe(chaveEscopo({ tipo: "colaboradores", nomes: ["C"] }));
    expect(chaveEscopo({ tipo: "tudo" })).not.toBe(chaveEscopo({ tipo: "nada" }));
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

  // Mudou de propósito: o seed agora só inclui (a tela de usuários é a fonte da verdade).
  it("seed só inclui por e-mail minúsculo: não altera nem desativa quem já existe", async () => {
    await sincronizarUsuarios(db, [
      { email: "A@exemplo.com.br", nome: "A", role: "admin" },
      { email: "b@exemplo.com.br", nome: "B", role: "vendedor" },
    ]);
    await sincronizarUsuarios(db, [
      { email: "a@exemplo.com.br", nome: "A2", role: "admin" },
      { email: "c@exemplo.com.br", nome: "C", role: "gestao" },
    ]);
    expect(await buscarUsuarioAtivo("a@exemplo.com.br")).toEqual({
      email: "a@exemplo.com.br", nome: "A", role: "admin",
    });
    expect(await buscarUsuarioAtivo("b@exemplo.com.br")).not.toBeNull();
    expect(await buscarUsuarioAtivo("c@exemplo.com.br")).not.toBeNull();
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
