import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  assertBypassSeguro,
  bypassAtivo,
  decidirAcesso,
  jwtCallback,
  permitirEntrada,
  renovarToken,
  sessionCallback,
  usuarioDaSessao,
  USUARIO_BYPASS,
} from "@/server/auth-core";

const pg = new PGlite();
const db = drizzle(pg);
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  await db.delete(users);
});

describe("signIn (lista de autorizados)", () => {
  it("e-mail ativo com papel gestao entra (sem diferenciar maiúsculas)", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "gestao" });
    expect(await permitirEntrada("ANA@exemplo.com.br")).toBe(true);
  });
  it("e-mail inexistente, vazio ou desativado é recusado", async () => {
    await db.insert(users).values({ email: "x@exemplo.com.br", nome: "X", role: "admin", ativo: false });
    expect(await permitirEntrada("nao@exemplo.com.br")).toBe(false);
    expect(await permitirEntrada("x@exemplo.com.br")).toBe(false);
    expect(await permitirEntrada(null)).toBe(false);
    expect(await permitirEntrada("")).toBe(false);
  });
  it("falha do banco recusa (fail closed)", async () => {
    const quebrado = { select: () => { throw new Error("db fora"); } } as never;
    expect(await permitirEntrada("a@b.com", quebrado)).toBe(false);
  });
});

describe("usuarioDaSessao (relê o banco a cada chamada)", () => {
  const sessao = { user: { email: "ana@exemplo.com.br" }, expiraEm: 123 };
  it("devolve o usuário ativo com papel do banco", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "gestao" });
    expect(await usuarioDaSessao(sessao)).toEqual({
      email: "ana@exemplo.com.br", nome: "Ana", role: "gestao", expiraEm: 123,
    });
  });
  it("desativado depois: null mesmo com JWT válido; mudança de papel vale na hora", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "gestao" });
    expect(await usuarioDaSessao(sessao)).not.toBeNull();
    await pg.query(`update users set role='vendedor' where email='ana@exemplo.com.br'`);
    expect((await usuarioDaSessao(sessao))?.role).toBe("vendedor");
    await pg.query(`update users set ativo=false where email='ana@exemplo.com.br'`);
    expect(await usuarioDaSessao(sessao)).toBeNull();
  });
  it("sem sessão, sem e-mail ou RefreshFailed: null", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "admin" });
    expect(await usuarioDaSessao(null)).toBeNull();
    expect(await usuarioDaSessao({ user: {}, expiraEm: 1 })).toBeNull();
    expect(await usuarioDaSessao({ ...sessao, error: "RefreshFailed" })).toBeNull();
  });
  it("falha do banco: null", async () => {
    const quebrado = { select: () => { throw new Error("db fora"); } } as never;
    expect(await usuarioDaSessao(sessao, { db: quebrado })).toBeNull();
  });
  it("bypass de paridade devolve parity@local admin, sem consultar nada", async () => {
    const u = await usuarioDaSessao(null, { env: { PARITY_AUTH_BYPASS: "1", NODE_ENV: "test" } });
    expect(u).toMatchObject({ email: "parity@local", role: "admin" });
    expect(u).toEqual(USUARIO_BYPASS);
  });
});

describe("bypass de teste", () => {
  it("com VERCEL definido lança erro, mesmo sem NODE_ENV=production", () => {
    expect(() => assertBypassSeguro({ PARITY_AUTH_BYPASS: "1", VERCEL: "1" })).toThrow(/VERCEL/);
    expect(() => bypassAtivo({ PARITY_AUTH_BYPASS: "1", VERCEL: "1" })).toThrow();
  });
  it("com NODE_ENV=production lança erro", () => {
    expect(() => assertBypassSeguro({ PARITY_AUTH_BYPASS: "1", NODE_ENV: "production" })).toThrow();
  });
  it("sem a flag nunca lança nem ativa", () => {
    expect(() => assertBypassSeguro({ VERCEL: "1", NODE_ENV: "production" })).not.toThrow();
    expect(bypassAtivo({ VERCEL: "1" })).toBe(false);
    expect(bypassAtivo({})).toBe(false);
    expect(bypassAtivo({ PARITY_AUTH_BYPASS: "0" })).toBe(false);
  });
  it("em dev/test com a flag ativa", () => {
    expect(bypassAtivo({ PARITY_AUTH_BYPASS: "1", NODE_ENV: "test" })).toBe(true);
  });
});

describe("renovação do token", () => {
  const env = {
    AUTH_MICROSOFT_ENTRA_ID_ID: "cid",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "sec",
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/T/v2.0",
  };
  const base = { email: "a@b.com", accessToken: "velho", refreshToken: "r1", expiresAt: 1000 };

  it("sucesso: atualiza token, expires_at e rotaciona refresh token", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "novo", expires_in: 3600, refresh_token: "r2" }), { status: 200 }));
    const t = await renovarToken(base, { fetch: f as never, agora: () => 2_000_000, env });
    expect(t).toMatchObject({ accessToken: "novo", refreshToken: "r2", expiresAt: 2000 + 3600 });
    expect(t.error).toBeUndefined();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/T/oauth2/v2.0/token");
    const corpo = new URLSearchParams(init.body as string);
    expect(corpo.get("grant_type")).toBe("refresh_token");
    expect(corpo.get("refresh_token")).toBe("r1");
    expect(corpo.get("client_id")).toBe("cid");
  });
  it("sucesso sem novo refresh_token mantém o antigo", async () => {
    const f = async () => new Response(JSON.stringify({ access_token: "n", expires_in: 60 }), { status: 200 });
    const t = await renovarToken(base, { fetch: f as never, agora: () => 0, env });
    expect(t.refreshToken).toBe("r1");
  });
  it("falha HTTP define error=RefreshFailed", async () => {
    const f = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const t = await renovarToken(base, { fetch: f as never, agora: () => 0, env });
    expect(t.error).toBe("RefreshFailed");
  });
  it("exceção de rede ou sem refresh token define RefreshFailed", async () => {
    const f = async () => { throw new Error("rede"); };
    expect((await renovarToken(base, { fetch: f as never, env })).error).toBe("RefreshFailed");
    expect((await renovarToken({ ...base, refreshToken: undefined }, { env })).error).toBe("RefreshFailed");
  });
});

describe("callbacks jwt/session", () => {
  it("login inicial guarda tokens; antes do vencimento não renova", async () => {
    const f = vi.fn();
    const t = await jwtCallback(
      { token: {}, account: { access_token: "a", refresh_token: "r", expires_at: 5000 }, user: { email: "A@B.com" } },
      { fetch: f as never, agora: () => 0 },
    );
    expect(t).toMatchObject({ accessToken: "a", refreshToken: "r", expiresAt: 5000, email: "a@b.com" });
    const t2 = await jwtCallback({ token: t }, { fetch: f as never, agora: () => 1000 * 1000 });
    expect(t2).toBe(t);
    expect(f).not.toHaveBeenCalled();
  });
  it("vencido renova; falha marca erro e a sessão o expõe", async () => {
    const f = async () => new Response("{}", { status: 500 });
    const t = await jwtCallback(
      { token: { email: "a@b.com", refreshToken: "r", expiresAt: 100 } },
      { fetch: f as never, agora: () => 99_000_000, env: {} },
    );
    expect(t.error).toBe("RefreshFailed");
    const s = sessionCallback({ session: { user: { email: "a@b.com" } }, token: t });
    expect(s.error).toBe("RefreshFailed");
    expect(JSON.stringify(s)).not.toContain("refreshToken");
  });
});

describe("decidirAcesso (proxy)", () => {
  const usuario = { email: "a@b.com", nome: "A", role: "gestao" as const, expiraEm: 1 };
  it("rotas públicas passam sem usuário", () => {
    for (const p of ["/entrar", "/sem-acesso", "/api/auth/session", "/api/auth/callback/microsoft-entra-id", "/_next/static/x.js", "/favicon.ico"])
      expect(decidirAcesso(p, null)).toBe("passar");
  });
  it("sem usuário: /api dá 401, página redireciona", () => {
    expect(decidirAcesso("/api/dados", null)).toBe("401");
    expect(decidirAcesso("/api", null)).toBe("401");
    expect(decidirAcesso("/", null)).toBe("entrar");
    expect(decidirAcesso("/qualquer/coisa", null)).toBe("entrar");
  });
  it("prefixos parecidos não são públicos", () => {
    expect(decidirAcesso("/entrarx", null)).toBe("entrar");
    expect(decidirAcesso("/api/authx/y", null)).toBe("401");
    expect(decidirAcesso("/sem-acesso/../api/x", null)).toBe("entrar");
  });
  it("com usuário passa", () => {
    expect(decidirAcesso("/", usuario)).toBe("passar");
    expect(decidirAcesso("/api/dados", usuario)).toBe("passar");
  });
});
