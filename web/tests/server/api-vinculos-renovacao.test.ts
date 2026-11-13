import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { listarVinculosRenovacao, salvarVinculoRenovacao, setDb } from "@/server/db/client";
import { vinculosRenovacao, vinculosRenovacaoHistorico } from "@/server/db/schema";
import { DELETE, GET, PUT } from "@/app/api/vinculos-renovacao/route";

const pg = new PGlite();
const db = drizzle(pg);
const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor") => ({ email: "g@x.com", nome: "X", role, expiraEm: 9e9 });
const req = (method: string, corpo?: unknown) =>
  new Request("http://x/api/vinculos-renovacao", { method, ...(corpo === undefined ? {} : { body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }) });
// Dados fictícios.
const ANT = { seg: "SegX", apolice: "A1", fim: "2026-11-15" };
const V = { ...ANT, renSeg: "SegX", renApolice: "R1", renVig: "2026-11-14" };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  usuario.mockReset();
  usuario.mockResolvedValue(sessao("gestao"));
  await db.delete(vinculosRenovacao);
  await db.delete(vinculosRenovacaoHistorico);
});

describe("/api/vinculos-renovacao", () => {
  it("bypass de paridade: lista vazia", async () => {
    vi.stubEnv("PARITY_AUTH_BYPASS", "1");
    await salvarVinculoRenovacao(V, "g", { substituir: false });
    const r = await GET();
    vi.unstubAllEnvs();
    expect(await r.json()).toEqual({ vinculos: [] });
  });

  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    for (const r of [await GET(), await PUT(req("PUT", V)), await DELETE(req("DELETE", ANT))]) expect(r.status).toBe(401);
  });

  it("gestão vincula, lista e desfaz; desfazer de novo dá 404", async () => {
    const p = await PUT(req("PUT", V));
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ ok: true, desfeitos: [] });
    expect((await (await GET()).json()).vinculos).toMatchObject([{ ...V, por: "g@x.com" }]);
    expect((await DELETE(req("DELETE", ANT))).status).toBe(200);
    expect(await listarVinculosRenovacao()).toEqual([]);
    const d = await DELETE(req("DELETE", ANT));
    expect(d.status).toBe(404);
    expect(await d.json()).toEqual({ erro: "Vínculo não encontrado." });
  });

  it("vendedor lê (200) mas não grava nem desfaz (403)", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    expect((await GET()).status).toBe(200);
    expect((await PUT(req("PUT", V))).status).toBe(403);
    expect((await DELETE(req("DELETE", ANT))).status).toBe(403);
    expect(await listarVinculosRenovacao()).toEqual([]);
  });

  it("admin também grava", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    expect((await PUT(req("PUT", V))).status).toBe(200);
  });

  it("validação: corpo malformado, campo faltando, data fora do formato → 400", async () => {
    for (const c of ["{x", { ...V, renApolice: "" }, { ...V, fim: "15/11/2026" }, { ...V, renVig: "2026-1-1" }]) {
      expect((await PUT(req("PUT", c))).status).toBe(400);
    }
    expect((await DELETE(req("DELETE", { ...ANT, fim: "" }))).status).toBe(400);
  });

  it("R começando mais de 90 dias depois do fim → 400 com a regra; no limite aceita", async () => {
    const r = await PUT(req("PUT", { ...V, renVig: "2027-02-14" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: "A renovação precisa começar até 90 dias depois do fim da apólice anterior." });
    expect((await PUT(req("PUT", { ...V, renVig: "2027-02-13" }))).status).toBe(200);
  });

  it("conflito → 409 com o vínculo existente; substituir → 200 com os desfeitos", async () => {
    await PUT(req("PUT", V));
    const outra = { ...V, renApolice: "R2", renVig: "2026-11-20" };
    const c = await PUT(req("PUT", outra));
    expect(c.status).toBe(409);
    const corpo = await c.json();
    expect(corpo.conflitos).toMatchObject([V]);
    expect(typeof corpo.erro).toBe("string");
    const s = await PUT(req("PUT", { ...outra, substituir: true }));
    expect(s.status).toBe(200);
    expect((await s.json()).desfeitos).toMatchObject([V]);
    expect(await listarVinculosRenovacao()).toMatchObject([outra]);
  });

  it("banco fora: 503", async () => {
    setDb({ select: () => { throw new Error("x"); } } as never);
    expect((await GET()).status).toBe(503);
    expect((await PUT(req("PUT", V))).status).toBe(503);
    setDb(db);
  });
});
