import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { setDb, listarIgnorados, nomesDoUsuario } from "@/server/db/client";
import { nomesIgnorados, users, vinculos } from "@/server/db/schema";
import { GET as getUsuarios, POST as postUsuario } from "@/app/api/admin/usuarios/route";
import { PUT as putVinculo } from "@/app/api/admin/vinculos/route";
import { PUT as putIgnorado } from "@/app/api/admin/ignorados/route";
import { GET as getProdutores } from "@/app/api/produtores/route";

const pg = new PGlite();
const db = drizzle(pg);
const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor", email = "mitz@x.com") => ({ email, nome: "X", role, expiraEm: 9e9 });
const req = (corpo: unknown) => new Request("http://x", { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
let ana: number, bia: number, adm: number;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  usuario.mockReset();
  usuario.mockResolvedValue(sessao("admin"));
  await db.delete(vinculos);
  await db.delete(nomesIgnorados);
  await db.delete(users);
  [{ id: ana }, { id: bia }, { id: adm }] = await db
    .insert(users)
    .values([
      { email: "ana@x.com", nome: "Ana", role: "vendedor" },
      { email: "bia@x.com", nome: "Bia", role: "vendedor", ativo: false },
      { email: "mitz@x.com", nome: "Mitz", role: "admin" },
    ])
    .returning({ id: users.id });
});

describe("permissões", () => {
  it("sem sessão: 401 em todas", async () => {
    usuario.mockResolvedValue(null);
    for (const r of [await getUsuarios(), await postUsuario(req({})), await putVinculo(req({})), await putIgnorado(req({})), await getProdutores()]) {
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("gestão em /api/admin/*: 403; vendedor em /api/produtores: 403", async () => {
    usuario.mockResolvedValue(sessao("gestao", "g@x.com"));
    for (const r of [await getUsuarios(), await postUsuario(req({})), await putVinculo(req({})), await putIgnorado(req({}))]) {
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ erro: "Sem permissão" });
    }
    usuario.mockResolvedValue(sessao("vendedor", "ana@x.com"));
    const r = await getProdutores();
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/admin/usuarios", () => {
  it("lista usuários e ignorados", async () => {
    await db.insert(nomesIgnorados).values({ nome: "LIXO", alteradoPor: "x" });
    const r = await getUsuarios();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const j = await r.json();
    expect(j.usuarios.map((u: { nome: string }) => u.nome)).toEqual(["Ana", "Bia", "Mitz"]);
    expect(j.ignorados).toEqual(["LIXO"]);
  });
});

describe("POST /api/admin/usuarios", () => {
  const ok = { email: "novo@x.com", nome: "Novo", role: "vendedor", ativo: true };
  it("validações 400", async () => {
    const casos: [unknown, string][] = [
      [{ ...ok, email: "semarroba" }, "E-mail inválido."],
      [{ ...ok, nome: "   " }, "Nome inválido."],
      [{ ...ok, role: "dono" }, "Papel inválido."],
      ["{ruim", "Requisição inválida."],
    ];
    for (const [corpo, msg] of casos) {
      const r = await postUsuario(req(corpo));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro: msg });
    }
  });
  it("cria e edita usuário", async () => {
    const r = await postUsuario(req(ok));
    const { id } = await r.json();
    expect(r.status).toBe(200);
    expect(typeof id).toBe("number");
    const r2 = await postUsuario(req({ ...ok, id, nome: "Novo 2", ativo: false }));
    expect(await r2.json()).toEqual({ ok: true, id });
  });
  it("admin não se rebaixa; e-mail duplicado recusado", async () => {
    const r = await postUsuario(req({ id: adm, email: "mitz@x.com", nome: "Mitz", role: "gestao", ativo: true }));
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toMatch(/próprio papel/);
    const r2 = await postUsuario(req({ ...ok, email: "ana@x.com" }));
    expect(r2.status).toBe(400);
  });
});

describe("PUT /api/admin/vinculos", () => {
  it("vincula (nome aparado), recusa duplicado e usuário inexistente, desvincula", async () => {
    expect(await (await putVinculo(req({ nome: "  A - S  ", userId: ana }))).json()).toEqual({ ok: true });
    expect(await nomesDoUsuario("ana@x.com")).toEqual(["A - S"]);
    const dup = await putVinculo(req({ nome: "A - S", userId: adm }));
    expect(dup.status).toBe(400);
    expect(await dup.json()).toEqual({ erro: "Este nome já está vinculado a Ana." });
    const inex = await putVinculo(req({ nome: "B", userId: 99999 }));
    expect(inex.status).toBe(400);
    expect(await inex.json()).toEqual({ erro: "Usuário não encontrado." });
    expect((await putVinculo(req({ nome: "A - S", userId: null }))).status).toBe(200);
    expect(await nomesDoUsuario("ana@x.com")).toEqual([]);
  });
  it("nome vazio e JSON ruim: 400", async () => {
    const r = await putVinculo(req({ nome: "   ", userId: ana }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: "Nome da planilha inválido." });
    expect(await (await putVinculo(req("x"))).json()).toEqual({ erro: "Requisição inválida." });
  });
});

describe("PUT /api/admin/ignorados", () => {
  it("ignora e reativa; nome vazio 400", async () => {
    expect(await (await putIgnorado(req({ nome: " LIXO ", ignorar: true }))).json()).toEqual({ ok: true });
    expect(await listarIgnorados()).toEqual(["LIXO"]);
    await putIgnorado(req({ nome: "LIXO", ignorar: false }));
    expect(await listarIgnorados()).toEqual([]);
    const r = await putIgnorado(req({ nome: " ", ignorar: true }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: "Nome da planilha inválido." });
  });
});

describe("GET /api/produtores", () => {
  it("lista só ativos com nomes; gestão pode", async () => {
    await putVinculo(req({ nome: "A", userId: ana }));
    await db.insert(vinculos).values({ nome: "B", userId: bia, alteradoPor: "x" });
    await db.insert(nomesIgnorados).values({ nome: "LIXO", alteradoPor: "x" });
    usuario.mockResolvedValue(sessao("gestao", "g@x.com"));
    const r = await getProdutores();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ produtores: [{ id: ana, nome: "Ana", nomes: ["A"] }], ignorados: ["LIXO"] });
  });
});
