import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { vinculosDoRecorte, aplicarEscopo, chaveEscopo, escopoDoUsuario, podeReprocessar } from "@/server/escopo";
import { linha } from "../domain/helpers";
import type { Atribuicao } from "@/domain/atribuicoes";
import type { VinculoRenovacao } from "@/domain/vinculos-renovacao";
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

describe("escopo com atribuições de renovação", () => {
  // Fictício: apólice A1 da ANA atribuída à BIA; Z9 da ANA atribuída ao CAIO.
  const a1 = linha({ colab: "ANA", seg: "S", apolice: "A1", vig: "2025-11-10", fim: "2026-11-10" });
  const a1End = linha({ colab: "ANA", seg: "S", apolice: "A1", endosso: "1", tipoDoc: "ENDOSSO", tipo: "EN", vig: "2026-02-01", fim: "2026-11-10" });
  const z9 = linha({ colab: "ANA", seg: "S", apolice: "Z9", vig: "2025-12-01", fim: "2026-12-01", docDigits: "222" });
  const bia = linha({ colab: "BIA", apolice: "B1", docDigits: "333" });
  const at = (apolice: string, fim: string, para: string): Atribuicao => ({ seg: "S", apolice, fim, para, de: "ANA", por: "g", em: "2026-11-10T00:00:00Z" });
  const atribs = [at("A1", "2026-11-10", "BIA"), at("Z9", "2026-12-01", "CAIO")];

  it("vendedor recebe as apólices atribuídas a ele (com endossos), não as atribuídas a outro, e sem as marcas", () => {
    const e = escopoDoUsuario({ role: "vendedor" }, ["BIA"], atribs);
    const ls = aplicarEscopo([a1, a1End, z9, bia], e);
    expect(ls).toEqual([a1, a1End, bia]);
    expect(ls.every((r) => r.resp === undefined)).toBe(true);
  });
  it("só as atribuições para os nomes do vendedor entram no escopo; sem elas o escopo é o de sempre", () => {
    expect(escopoDoUsuario({ role: "vendedor" }, ["BIA"], atribs)).toEqual({ tipo: "colaboradores", nomes: ["BIA"], atribuicoes: [atribs[0]] });
    expect(escopoDoUsuario({ role: "vendedor" }, ["DAVI"], atribs)).toEqual({ tipo: "colaboradores", nomes: ["DAVI"] });
    expect(escopoDoUsuario({ role: "gestao" }, [], atribs)).toEqual({ tipo: "tudo" });
  });
  it("chaveEscopo muda quando muda a atribuição do vendedor", () => {
    const sem = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"]));
    const com = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"], atribs));
    const outra = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at("A1", "2027-11-10", "BIA")]));
    expect(com).not.toBe(sem);
    expect(outra).not.toBe(com);
  });
});

describe("atribuições com nome composto", () => {
  const at = (para: string): Atribuicao => ({ seg: "S", apolice: "A1", fim: "2026-11-10", para, de: "X", por: "g", em: "" });
  it("atribuição para 'ANA , BIA' entra no escopo da vendedora ANA", () => {
    expect(escopoDoUsuario({ role: "vendedor" }, ["ANA"], [at("ANA , BIA")])).toMatchObject({ atribuicoes: [at("ANA , BIA")] });
  });
});

describe("escopo com vínculo manual de renovação", () => {
  // Fictício: A1 da ANA (doc 111) atribuída à BIA; a renovação R7 saiu no nome do cônjuge (doc 999), colaborador CAIO.
  const a1 = linha({ colab: "ANA", seg: "S", apolice: "A1", vig: "2025-11-10", fim: "2026-11-10", docDigits: "111", ramo: "Auto" });
  const r7 = linha({ tipo: "R", colab: "CAIO", seg: "S", apolice: "R7", vig: "2026-11-12", fim: "2027-11-12", docDigits: "999", ramo: "Auto" });
  const at: Atribuicao = { seg: "S", apolice: "A1", fim: "2026-11-10", para: "BIA", de: "ANA", por: "g", em: "" };
  const v: VinculoRenovacao = { seg: "S", apolice: "A1", fim: "2026-11-10", renSeg: "S", renApolice: "R7", renVig: "2026-11-12", por: "g", em: "" };

  it("vendedor com a antiga atribuída recebe a R vinculada; sem o vínculo não", () => {
    expect(aplicarEscopo([a1, r7], escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at]))).toEqual([a1]);
    expect(aplicarEscopo([a1, r7], escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at], [v]))).toEqual([a1, r7]);
  });
  // Mudou de propósito (revisão final): os vínculos entram no escopo de todo vendedor, com ou sem atribuição, para
  // que um vínculo novo mude o ETag e a lista do vendedor não fique velha.
  it("vínculos entram no escopo do vendedor mesmo sem atribuição; gestão não", () => {
    expect(escopoDoUsuario({ role: "vendedor" }, ["DAVI"], [at], [v])).toEqual({ tipo: "colaboradores", nomes: ["DAVI"], vinculos: [v] });
    expect(escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at], [v])).toEqual({ tipo: "colaboradores", nomes: ["BIA"], atribuicoes: [at], vinculos: [v] });
    expect(escopoDoUsuario({ role: "gestao" }, [], [at], [v])).toEqual({ tipo: "tudo" });
    const sem = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["DAVI"]));
    expect(chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["DAVI"], [], [v]))).not.toBe(sem);
  });
  it("vinculosDoRecorte: só os vínculos cuja antiga ou R está nas linhas do vendedor", () => {
    const outroA = { ...v, apolice: "Z1", renApolice: "Z2" };
    expect(vinculosDoRecorte([v, outroA], [a1])).toEqual([v]);
    expect(vinculosDoRecorte([v, outroA], [r7])).toEqual([v]);
    expect(vinculosDoRecorte([v, outroA], [])).toEqual([]);
  });
  it("chaveEscopo muda quando muda o vínculo", () => {
    const sem = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at]));
    const com = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at], [v]));
    const outro = chaveEscopo(escopoDoUsuario({ role: "vendedor" }, ["BIA"], [at], [{ ...v, renApolice: "R8" }]));
    expect(com).not.toBe(sem);
    expect(outro).not.toBe(com);
  });
});
