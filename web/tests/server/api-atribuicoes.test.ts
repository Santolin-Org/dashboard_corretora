import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { listarAtribuicoes, salvarAtribuicao, setDb } from "@/server/db/client";
import { atribuicoesHistorico, atribuicoesRenovacao, users, vinculos } from "@/server/db/schema";
import { DELETE, GET, PUT } from "@/app/api/atribuicoes/route";

const pg = new PGlite();
const db = drizzle(pg);
const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor", email = "g@x.com") => ({ email, nome: "X", role, expiraEm: 9e9 });
const req = (method: string, corpo?: unknown) =>
  new Request("http://x/api/atribuicoes", { method, ...(corpo === undefined ? {} : { body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }) });
const K = { seg: "SegX", apolice: "A1", fim: "2026-11-10" };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  usuario.mockReset();
  usuario.mockResolvedValue(sessao("gestao"));
  await db.delete(atribuicoesRenovacao);
  await db.delete(atribuicoesHistorico);
  await db.delete(vinculos);
  await db.delete(users);
  const [{ id }] = await db.insert(users).values({ email: "bia@x.com", nome: "Bia", role: "vendedor" }).returning({ id: users.id });
  await db.insert(vinculos).values({ nome: "BIA", userId: id, alteradoPor: "t" });
});

describe("/api/atribuicoes", () => {
  it("bypass de paridade: lista vazia sem consultar o banco (o harness roda sem banco)", async () => {
    vi.stubEnv("PARITY_AUTH_BYPASS", "1");
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "g");
    const r = await GET();
    vi.unstubAllEnvs();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ atribuicoes: [] });
  });

  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    for (const r of [await GET(), await PUT(req("PUT", { ...K, para: "BIA", de: "ANA" })), await DELETE(req("DELETE", K))]) expect(r.status).toBe(401);
  });

  it("gestão atribui, lista e desfaz", async () => {
    const p = await PUT(req("PUT", { ...K, para: "BIA", de: "ANA" }));
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ ok: true });
    const g = await (await GET()).json();
    expect(g.atribuicoes).toHaveLength(1);
    expect(g.atribuicoes[0]).toMatchObject({ ...K, para: "BIA", de: "ANA", por: "g@x.com" });
    expect((await DELETE(req("DELETE", K))).status).toBe(200);
    expect(await listarAtribuicoes()).toEqual([]);
    expect((await DELETE(req("DELETE", K))).status).toBe(404);
  });

  it("admin também escreve; vendedor não (403) e nada é gravado", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    expect((await PUT(req("PUT", { ...K, para: "BIA", de: "ANA" }))).status).toBe(200);
    usuario.mockResolvedValue(sessao("vendedor", "bia@x.com"));
    expect((await PUT(req("PUT", { ...K, para: "CAIO", de: "ANA" }))).status).toBe(403);
    expect((await DELETE(req("DELETE", K))).status).toBe(403);
    expect((await listarAtribuicoes())[0].para).toBe("BIA");
  });

  it("validação: corpo malformado, campos vazios e fim fora do formato dão 400", async () => {
    expect((await PUT(req("PUT", "{"))).status).toBe(400);
    expect((await PUT(req("PUT", { ...K, para: " ", de: "ANA" }))).status).toBe(400);
    expect((await PUT(req("PUT", { ...K, fim: "10/11/2026", para: "BIA", de: "ANA" }))).status).toBe(400);
    expect((await PUT(req("PUT", { ...K, apolice: 7, para: "BIA", de: "ANA" }))).status).toBe(400);
    expect((await DELETE(req("DELETE", { seg: "S" }))).status).toBe(400);
    expect(await listarAtribuicoes()).toEqual([]);
  });

  it("vendedor lê só as atribuições para ou de um nome dele", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "g");
    await salvarAtribuicao({ ...K, apolice: "A2", para: "CAIO", de: "BIA" }, "g");
    await salvarAtribuicao({ ...K, apolice: "A3", para: "CAIO", de: "ANA" }, "g");
    usuario.mockResolvedValue(sessao("vendedor", "bia@x.com"));
    const g = await (await GET()).json();
    expect(g.atribuicoes.map((a: { apolice: string }) => a.apolice).sort()).toEqual(["A1", "A2"]);
  });
});

describe("/api/atribuicoes com nome composto", () => {
  it("vendedor recebe a atribuição cujo de/para é um nome composto que inclui o dele", async () => {
    await salvarAtribuicao({ ...K, para: "CESAR", de: "ANA , BIA" }, "g");
    await salvarAtribuicao({ ...K, apolice: "A9", para: "BIA , DAVI", de: "ANA" }, "g");
    usuario.mockResolvedValue(sessao("vendedor", "bia@x.com"));
    const g = await (await GET()).json();
    expect(g.atribuicoes.map((a: { apolice: string }) => a.apolice).sort()).toEqual(["A1", "A9"]);
  });
});
