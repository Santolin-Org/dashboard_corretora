import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { obterBase, definirDependencias, reiniciarIngestao } from "@/server/ingestao";
import { criarArmazemMemoria } from "@/server/snapshots";
import { PastaLocalFonte } from "@/server/fontes/pasta-local";
import { decodificarLinhas, decodificarSinistros } from "@/domain/serializacao";
import { GET } from "@/app/api/dados/route";

const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor", email = "a@b") => ({ email, nome: "A", role, expiraEm: 9e9 });
const req = (h: Record<string, string> = {}) => new Request("http://x/api/dados", { headers: h });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dados-"));
  gerarFixture(dir);
  reiniciarIngestao();
  definirDependencias({ fonte: () => new PastaLocalFonte(dir), armazem: criarArmazemMemoria(), hoje: () => "2026-10-15", ttlNegativoMs: 0 });
  usuario.mockReset();
});
afterEach(() => {
  definirDependencias(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/dados", () => {
  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    const r = await GET(req());
    expect(r.status).toBe(401);
  });

  it("vendedor: 200 com linhas e sinistros vazios e sem manifesto/avisos", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    const r = await GET(req());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(decodificarLinhas(j.linhas)).toEqual([]);
    expect(decodificarSinistros(j.sinistros)).toEqual([]);
    expect(j.manifesto).toEqual([]);
    expect(j.avisos).toEqual([]);
    expect(j.avisosSaude).toEqual([]);
    expect(JSON.stringify(j)).not.toMatch(/producao_|\.xlsx/);
  });

  it("gestao: recebe todas as linhas e sinistros", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const b = await obterBase();
    const r = await GET(req());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(decodificarLinhas(j.linhas)).toEqual(b.linhas);
    expect(decodificarSinistros(j.sinistros)).toEqual(b.sinistros);
    expect(j.versao).toBe(b.versao);
    expect(j.hoje).toBe("2026-10-15");
    expect(j.manifesto.length).toBeGreaterThan(0);
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("If-None-Match igual ao ETag: 304 sem corpo; outro usuário não reaproveita o ETag", async () => {
    usuario.mockResolvedValue(sessao("admin", "um@x"));
    const r1 = await GET(req());
    const etag = r1.headers.get("etag")!;
    expect(etag).toMatch(/^"[^"]+"$/);
    const r2 = await GET(req({ "if-none-match": etag }));
    expect(r2.status).toBe(304);
    expect(await r2.text()).toBe("");
    expect(r2.headers.get("etag")).toBe(etag);
    usuario.mockResolvedValue(sessao("admin", "dois@x"));
    const r3 = await GET(req({ "if-none-match": etag }));
    expect(r3.status).toBe(200);
  });

  it("ETag distingue escopos: vendedor e gestao com o mesmo e-mail não compartilham", async () => {
    usuario.mockResolvedValue(sessao("gestao", "m@x"));
    const e1 = (await GET(req())).headers.get("etag");
    usuario.mockResolvedValue(sessao("vendedor", "m@x"));
    const e2 = (await GET(req())).headers.get("etag");
    expect(e1).not.toBe(e2);
  });
});
