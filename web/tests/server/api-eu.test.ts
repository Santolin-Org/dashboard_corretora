import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));
vi.mock("@/server/db/client", () => ({ nomesDoUsuario: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { nomesDoUsuario } from "@/server/db/client";
import { USUARIO_BYPASS } from "@/server/auth-core";
import { GET } from "@/app/api/eu/route";

const usuario = vi.mocked(usuarioDaRequisicao);
const nomes = vi.mocked(nomesDoUsuario);
const sessao = (role: "admin" | "gestao" | "vendedor", email = "ana@x") => ({ email, nome: "Ana", role, expiraEm: 9e9 });

beforeEach(() => {
  usuario.mockReset();
  nomes.mockReset();
  vi.unstubAllEnvs();
});

describe("GET /api/eu", () => {
  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("vendedor: os próprios nomes, no-store", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    nomes.mockResolvedValue(["ANA", "ANA C"]);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ email: "ana@x", nome: "Ana", role: "vendedor", nomes: ["ANA", "ANA C"] });
    expect(nomes).toHaveBeenCalledWith("ana@x");
  });
  it("admin/gestão também recebem os próprios nomes (podem ser [])", async () => {
    usuario.mockResolvedValue(sessao("gestao", "g@x"));
    nomes.mockResolvedValue([]);
    expect(await (await GET()).json()).toEqual({ email: "g@x", nome: "Ana", role: "gestao", nomes: [] });
  });
  it("banco fora: 503 no-store", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    nomes.mockRejectedValue(new Error("x"));
    const r = await GET();
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("bypass de paridade: responde sem consultar o banco", async () => {
    vi.stubEnv("PARITY_AUTH_BYPASS", "1");
    vi.stubEnv("VERCEL", undefined as unknown as string);
    usuario.mockResolvedValue(USUARIO_BYPASS);
    const r = await GET();
    expect(r.status).toBe(200);
    expect((await r.json()).nomes).toEqual([]);
    expect(nomes).not.toHaveBeenCalled();
  });
});
