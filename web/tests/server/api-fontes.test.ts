import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { definirDependencias, reiniciarIngestao } from "@/server/ingestao";
import { criarArmazemMemoria } from "@/server/snapshots";
import { PastaLocalFonte } from "@/server/fontes/pasta-local";
import { GET } from "@/app/api/fontes/route";

const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor") => ({ email: "a@b", nome: "A", role, expiraEm: 9e9 });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fontes-api-"));
  gerarFixture(dir);
  reiniciarIngestao();
  definirDependencias({ fonte: () => new PastaLocalFonte(dir), armazem: criarArmazemMemoria(), hoje: () => "2026-10-15", ttlNegativoMs: 0 });
  usuario.mockReset();
});
afterEach(() => {
  definirDependencias(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/fontes", () => {
  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("vendedor (escopo nada): 403 sem o campo", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    const r = await GET();
    expect(r.status).toBe(403);
    expect(await r.json()).not.toHaveProperty("podeReprocessar");
  });
  it("admin: 200 com podeReprocessar true", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    const r = await GET();
    expect(r.status).toBe(200);
    const c = await r.json();
    expect(c.podeReprocessar).toBe(true);
    expect(Array.isArray(c.manifesto)).toBe(true);
  });
  it("gestão: 200 com podeReprocessar false", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const r = await GET();
    expect(r.status).toBe(200);
    expect((await r.json()).podeReprocessar).toBe(false);
  });
});
