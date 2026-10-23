import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb } from "@/server/db/client";
import {
  ignorarNome,
  listarIgnorados,
  listarProdutores,
  listarUsuarios,
  nomesDoUsuario,
  salvarUsuario,
  vincularNome,
} from "@/server/db/client";
import { nomesIgnorados, users, vinculos } from "@/server/db/schema";

const pg = new PGlite();
const db = drizzle(pg);
let ana: number, bia: number, adm: number;
const adminAutor = () => ({ id: adm, email: "mitz@x.com" });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  await db.delete(vinculos);
  await db.delete(nomesIgnorados);
  await db.delete(users);
  [{ id: ana }, { id: bia }, { id: adm }] = await db
    .insert(users)
    .values([
      { email: "ana@x.com", nome: "Ana", role: "vendedor" },
      { email: "bia@x.com", nome: "Bia", role: "vendedor" },
      { email: "mitz@x.com", nome: "Mitz", role: "admin" },
    ])
    .returning({ id: users.id });
});

describe("vínculos", () => {
  it("vincularNome: nome é de um login só", async () => {
    expect(await vincularNome("A - SANTOLIN", ana, "mitz")).toEqual({ ok: true });
    expect(await vincularNome("A - SANTOLIN", bia, "mitz")).toEqual({ ok: false, erro: "Este nome já está vinculado a Ana." });
    expect(await nomesDoUsuario("ANA@x.com")).toEqual(["A - SANTOLIN"]);
    expect(await vincularNome("A - SANTOLIN", null, "mitz")).toEqual({ ok: true });
    expect(await nomesDoUsuario("ana@x.com")).toEqual([]);
  });
  it("vincular nome de outro dono não toca na linha existente (o banco decide, sem corrida)", async () => {
    await vincularNome("A", ana, "mitz");
    expect(await vincularNome("A", bia, "outro")).toEqual({ ok: false, erro: "Este nome já está vinculado a Ana." });
    const r = await pg.query<{ user_id: number; alterado_por: string }>(`select user_id, alterado_por from vinculos where nome='A'`);
    expect(r.rows).toEqual([{ user_id: ana, alterado_por: "mitz" }]);
  });
  it("corrida: outro admin vincula o nome entre a leitura e a gravação → recusa, dono mantido", async () => {
    // Simula a corrida: o vínculo de Bia aparece logo antes do insert deste pedido.
    const corrida = new Proxy(db, {
      get(alvo, k, r) {
        if (k !== "insert") return Reflect.get(alvo, k, r);
        return (t: typeof vinculos) => { const b = alvo.insert(t); const valores = b.values.bind(b);
          return { values: (v: typeof vinculos.$inferInsert) => { const q = valores(v); const conflito = q.onConflictDoUpdate.bind(q);
            return { onConflictDoUpdate: (c: Parameters<typeof conflito>[0]) => { const qq = conflito(c);
              return { returning: async (...a: Parameters<typeof qq.returning>) => {
                await pg.query(`insert into vinculos (nome, user_id, alterado_por) values ('R', ${bia}, 'outro')`);
                return qq.returning(...a);
              } }; } }; } }; };
      },
    }) as unknown as typeof db;
    expect(await vincularNome("R", ana, "mitz", corrida)).toEqual({ ok: false, erro: "Este nome já está vinculado a Bia." });
    const r = await pg.query<{ user_id: number }>(`select user_id from vinculos where nome='R'`);
    expect(r.rows).toEqual([{ user_id: bia }]);
  });
  it("revincular ao mesmo dono é ok; nomes saem ordenados", async () => {
    await vincularNome("Z", ana, "mitz");
    expect(await vincularNome("Z", ana, "mitz")).toEqual({ ok: true });
    await vincularNome("B", ana, "mitz");
    expect(await nomesDoUsuario(" Ana@X.com ")).toEqual(["B", "Z"]);
  });
  it("nomesDoUsuario ignora usuário inativo", async () => {
    await vincularNome("A", ana, "mitz");
    await pg.query(`update users set ativo=false where email='ana@x.com'`);
    expect(await nomesDoUsuario("ana@x.com")).toEqual([]);
  });
  it("listarProdutores traz só ativos com nomes; listarUsuarios ordena por nome", async () => {
    await vincularNome("A", ana, "mitz");
    await vincularNome("B", bia, "mitz");
    await pg.query(`update users set ativo=false where email='bia@x.com'`);
    expect(await listarProdutores()).toEqual([{ id: ana, nome: "Ana", nomes: ["A"] }]);
    const us = await listarUsuarios();
    expect(us.map((u) => u.nome)).toEqual(["Ana", "Bia", "Mitz"]);
    expect(us[0]).toMatchObject({ email: "ana@x.com", role: "vendedor", ativo: true, nomes: ["A"] });
  });
});

describe("salvarUsuario", () => {
  it("e-mail minúsculo, duplicado recusado, admin não se rebaixa nem se desativa", async () => {
    expect(await salvarUsuario({ email: "Novo@X.com", nome: "Novo", role: "vendedor", ativo: true }, adminAutor())).toMatchObject({ ok: true });
    expect((await listarUsuarios()).find((u) => u.nome === "Novo")?.email).toBe("novo@x.com");
    expect(await salvarUsuario({ email: "novo@x.com", nome: "N2", role: "vendedor", ativo: true }, adminAutor())).toEqual({ ok: false, erro: "Já existe um usuário com este e-mail." });
    expect(await salvarUsuario({ id: adm, email: "mitz@x.com", nome: "M", role: "gestao", ativo: true }, adminAutor())).toEqual({ ok: false, erro: "Você não pode tirar o seu próprio papel de admin." });
    expect(await salvarUsuario({ id: adm, email: "mitz@x.com", nome: "M", role: "admin", ativo: false }, adminAutor())).toEqual({ ok: false, erro: "Você não pode desativar o seu próprio usuário." });
  });
  it("edita outro usuário e grava alteradoPor", async () => {
    expect(await salvarUsuario({ id: ana, email: "ana@x.com", nome: "Ana B", role: "gestao", ativo: false }, adminAutor())).toEqual({ ok: true, id: ana });
    const r = await pg.query<{ nome: string; role: string; ativo: boolean; alterado_por: string }>(`select nome, role, ativo, alterado_por from users where id=${ana}`);
    expect(r.rows[0]).toEqual({ nome: "Ana B", role: "gestao", ativo: false, alterado_por: "mitz@x.com" });
  });
  it("editar o e-mail para o de outro usuário é recusado", async () => {
    expect(await salvarUsuario({ id: ana, email: "BIA@x.com", nome: "Ana", role: "vendedor", ativo: true }, adminAutor())).toEqual({ ok: false, erro: "Já existe um usuário com este e-mail." });
  });
  it("admin não pode alterar o próprio e-mail (se trancaria fora)", async () => {
    expect(await salvarUsuario({ id: adm, email: "outro@x.com", nome: "Mitz", role: "admin", ativo: true }, adminAutor())).toEqual({ ok: false, erro: "Você não pode alterar o seu próprio e-mail." });
    expect((await listarUsuarios()).find((u) => u.id === adm)?.email).toBe("mitz@x.com");
    // mesma caixa/espaços normalizados não conta como troca
    expect(await salvarUsuario({ id: adm, email: " MITZ@x.com ", nome: "Mitz", role: "admin", ativo: true }, adminAutor())).toEqual({ ok: true, id: adm });
  });
  it("admin pode editar o próprio nome mantendo papel e ativo", async () => {
    expect(await salvarUsuario({ id: adm, email: "mitz@x.com", nome: "Mitz V", role: "admin", ativo: true }, adminAutor())).toEqual({ ok: true, id: adm });
  });
});

describe("nomes ignorados", () => {
  it("ignorarNome liga e desliga", async () => {
    await ignorarNome("X", true, "mitz");
    await ignorarNome("X", true, "mitz");
    await ignorarNome("Y", true, "mitz");
    expect(await listarIgnorados()).toEqual(["X", "Y"]);
    await ignorarNome("X", false, "mitz");
    expect(await listarIgnorados()).toEqual(["Y"]);
  });
});
