import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { ErroFonte, isProducaoFileName } from "@/server/fontes/tipos";
import { PastaLocalFonte } from "@/server/fontes/pasta-local";
import { GraphFonte } from "@/server/fontes/graph";

describe("isProducaoFileName", () => {
  it("aceita variações de produção", () => {
    expect(isProducaoFileName("producao_2026.xlsx")).toBe(true);
    expect(isProducaoFileName("Produção 2024.XLSX")).toBe(true);
    expect(isProducaoFileName("PRODUCAO.xls")).toBe(true);
  });
  it("recusa temporários e outros arquivos", () => {
    expect(isProducaoFileName("~$producao_2026.xlsx")).toBe(false);
    expect(isProducaoFileName("sinistrosAvisados.xlsx")).toBe(false);
  });
});

describe("PastaLocalFonte", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "fonte-"));
    gerarFixture(dir);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lista os 5 arquivos e baixa os bytes", async () => {
    const f = new PastaLocalFonte(dir);
    const lista = await f.listar();
    expect(lista).toHaveLength(5);
    expect(lista.map((a) => a.nome)).toEqual(readdirSync(dir).sort((a, b) => a.localeCompare(b)));
    expect(lista[0].tag).toMatch(/\S/);
    expect(new Date(lista[0].modificadoEm).toISOString()).toBe(lista[0].modificadoEm);
    const buf = await f.baixar(lista[0]);
    expect(Buffer.from(buf).equals(readFileSync(join(dir, lista[0].nome)))).toBe(true);
  });
});

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const cred = { tenantId: "t", clientId: "c", clientSecret: "s" };

describe("GraphFonte", () => {
  it("401 no token → auth", async () => {
    const f = new GraphFonte({ ...cred, fetch: async () => json({ error: "x" }, 401) });
    await expect(f.listar()).rejects.toMatchObject({ name: "ErroFonte", codigo: "auth" });
  });

  it("404 na pasta → pasta", async () => {
    const fetchMock = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/oauth2/v2.0/token")) return json({ access_token: "tok", expires_in: 3600 });
      if (u.endsWith("/sites/santolinseguros.sharepoint.com")) return json({ id: "site1" });
      if (u.endsWith("/sites/site1/drives")) return json({ value: [{ id: "d1", name: "santolin" }] });
      if (u.includes("/root:/Dashboard:/children")) return json({ error: {} }, 404);
      return json({}, 500);
    };
    const f = new GraphFonte({ ...cred, fetch: fetchMock });
    const e = await f.listar().catch((x) => x);
    expect(e).toBeInstanceOf(ErroFonte);
    expect(e.codigo).toBe("pasta");
  });

  it("lista com paginação, ignora pastas, ordena, reaproveita token e baixa", async () => {
    let tokens = 0;
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oauth2/v2.0/token")) {
        tokens++;
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return json({ access_token: "tok", expires_in: 3600 });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      if (u.endsWith("/sites/santolinseguros.sharepoint.com")) return json({ id: "site1" });
      if (u.endsWith("/sites/site1/drives")) return json({ value: [{ id: "d0", name: "Outra" }, { id: "d1", name: "Santolin" }] });
      if (u.includes("/drives/d1/root:/Dashboard:/children"))
        return json({
          value: [{ id: "b", name: "b.xlsx", size: 5, cTag: "c-b", lastModifiedDateTime: "2026-01-02T00:00:00Z" }, { id: "p", name: "Sub", folder: {} }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
        });
      if (u.endsWith("/next-page"))
        return json({ value: [{ id: "a", name: "a.xlsx", size: 7, eTag: "e-a", lastModifiedDateTime: "2026-01-01T00:00:00Z" }] });
      if (u.endsWith("/drives/d1/items/a/content")) return new Response(new Uint8Array([1, 2, 3]));
      return json({}, 500);
    };
    const f = new GraphFonte({ ...cred, fetch: fetchMock });
    const lista = await f.listar();
    expect(lista.map((a) => [a.id, a.nome, a.tag])).toEqual([["a", "a.xlsx", "e-a"], ["b", "b.xlsx", "c-b"]]);
    const buf = await f.baixar(lista[0]);
    expect(Array.from(new Uint8Array(buf))).toEqual([1, 2, 3]);
    expect(tokens).toBe(1);
  });

  it("exceção de rede → rede; 500 → http com status; 403 → auth", async () => {
    const rede = new GraphFonte({ ...cred, fetch: async () => { throw new TypeError("fail"); } });
    await expect(rede.listar()).rejects.toMatchObject({ codigo: "rede" });
    const ok = (status: number) => async (url: string | URL | Request) =>
      String(url).includes("/oauth2/") ? json({ access_token: "t", expires_in: 3600 }) : json({}, status);
    await expect(new GraphFonte({ ...cred, fetch: ok(500) }).listar()).rejects.toMatchObject({ codigo: "http", status: 500 });
    await expect(new GraphFonte({ ...cred, fetch: ok(403) }).listar()).rejects.toMatchObject({ codigo: "auth" });
  });

  it("biblioteca ausente → pasta", async () => {
    const fetchMock = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/oauth2/")) return json({ access_token: "t", expires_in: 3600 });
      if (u.endsWith("/sites/santolinseguros.sharepoint.com")) return json({ id: "s" });
      return json({ value: [{ id: "x", name: "Outra" }] });
    };
    await expect(new GraphFonte({ ...cred, fetch: fetchMock }).listar()).rejects.toMatchObject({ codigo: "pasta" });
  });
});
