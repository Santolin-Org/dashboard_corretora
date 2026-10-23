import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  assertBypassSeguro,
  assertIssuerSeguro,
  ehPublica,
  permitirLogin,
  ISSUER_PADRAO,
  TENANT_ID,
  bypassAtivo,
  decidirAcesso,
  respostaDoProxy,
  jwtCallback,
  permitirEntrada,
  renovarToken,
  sessionCallback,
  usuarioDaSessao,
  USUARIO_BYPASS,
  codigoErroAuth,
  avaliarLogin,
  emailDoPerfil,
  mascararEmail,
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
    // sempre o tenant Santolin (ISSUER_PADRAO), mesmo com outra env (que assertIssuerSeguro recusaria no boot)
    expect(url).toBe(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`);
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
  });  it("decidirAcesso por papel", () => {
    const sessao = usuario;
    const v = { ...sessao, role: "vendedor" as const }, g = { ...sessao, role: "gestao" as const }, a = { ...sessao, role: "admin" as const };
    expect(decidirAcesso("/producao", v)).toBe("meu-painel");
    expect(decidirAcesso("/meu-painel", v)).toBe("passar");
    expect(decidirAcesso("/api/fontes", v)).toBe("403");
    expect(decidirAcesso("/api/produtores", v)).toBe("403");
    expect(decidirAcesso("/api/dados", v)).toBe("passar");
    expect(decidirAcesso("/admin/usuarios", g)).toBe("403");
    expect(decidirAcesso("/api/admin/usuarios", g)).toBe("403");
    expect(decidirAcesso("/api/produtores", g)).toBe("passar");
    expect(decidirAcesso("/admin/usuarios", a)).toBe("passar");
    expect(decidirAcesso("/admin/../producao", v)).not.toBe("passar");
  });
  it("vendedor: só / e /meu-painel como páginas; só /api/dados e /api/eu como APIs", () => {
    const v = { ...usuario, role: "vendedor" as const };
    expect(decidirAcesso("/", v)).toBe("passar");
    for (const p of ["/visao-geral", "/producao", "/produtores", "/admin", "/admin/usuarios", "/apresentacao", "/exibicao-tv", "/meu-painelx", "/meu-painel/x"])
      expect(decidirAcesso(p, v)).toBe("meu-painel");
    expect(decidirAcesso("/api/eu", v)).toBe("passar");
    for (const p of ["/api", "/api/admin/usuarios", "/api/reprocessar", "/api/dados/x", "/api/dadosx", "/api/eu/x"])
      expect(decidirAcesso(p, v)).toBe("403");
  });
  it("gestão: /admin e /api/admin (com e sem barra) dão 403; o resto passa", () => {
    const g = { ...usuario, role: "gestao" as const };
    for (const p of ["/admin", "/admin/", "/api/admin", "/api/admin/x"]) expect(decidirAcesso(p, g)).toBe("403");
    for (const p of ["/administrador", "/visao-geral", "/produtores", "/api/fontes", "/api/eu"]) expect(decidirAcesso(p, g)).toBe("passar");
  });
  it("caminho com .. nunca passa, para nenhum papel", () => {
    for (const role of ["vendedor", "gestao", "admin"] as const) {
      const u = { ...usuario, role };
      for (const p of ["/admin/../producao", "/meu-painel/..", "/api/dados/../fontes", "/.."]) expect(decidirAcesso(p, u)).not.toBe("passar");
    }
    expect(decidirAcesso("/api/dados/../fontes", { ...usuario, role: "admin" })).toBe("403");
  });
});

describe("respostaDoProxy", () => {
  it("403 em API vira JSON; 403 em página vai para /visao-geral; meu-painel redireciona", () => {
    expect(respostaDoProxy("passar", "/x")).toEqual({ tipo: "seguir" });
    expect(respostaDoProxy("401", "/api/x")).toEqual({ tipo: "json", status: 401, erro: "não autenticado" });
    expect(respostaDoProxy("403", "/api/fontes")).toEqual({ tipo: "json", status: 403, erro: "Sem permissão" });
    expect(respostaDoProxy("403", "/api")).toEqual({ tipo: "json", status: 403, erro: "Sem permissão" });
    expect(respostaDoProxy("403", "/admin/usuarios")).toEqual({ tipo: "redirecionar", para: "/visao-geral" });
    expect(respostaDoProxy("meu-painel", "/producao")).toEqual({ tipo: "redirecionar", para: "/meu-painel" });
    expect(respostaDoProxy("entrar", "/")).toEqual({ tipo: "redirecionar", para: "/entrar" });
  });
});

describe("tenant fixo", () => {
  it("issuer divergente (ex.: /common) lança; igual ou ausente passa", () => {
    expect(() => assertIssuerSeguro({ AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/common/v2.0" })).toThrow();
    expect(assertIssuerSeguro({ AUTH_MICROSOFT_ENTRA_ID_ISSUER: ISSUER_PADRAO })).toBe(ISSUER_PADRAO);
    expect(assertIssuerSeguro({})).toBe(ISSUER_PADRAO);
  });
  it("signIn exige tid da Santolin mesmo com e-mail listado", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "gestao" });
    expect(await permitirLogin("ana@exemplo.com.br", TENANT_ID)).toBe(true);
    expect(await permitirLogin("ana@exemplo.com.br", "outro-tenant")).toBe(false);
    expect(await permitirLogin("ana@exemplo.com.br", undefined)).toBe(false);
  });
});

describe("e-mail do perfil e motivo da recusa (login real em produção caía em /sem-acesso)", () => {
  it("emailDoPerfil usa a claim email e cai para preferred_username/upn quando ela falta", () => {
    expect(emailDoPerfil({ email: "Ana@Exemplo.com.br", preferred_username: "x@y.com" })).toBe("ana@exemplo.com.br");
    expect(emailDoPerfil({ preferred_username: "Mitz@Santolin.com.br" })).toBe("mitz@santolin.com.br");
    expect(emailDoPerfil({ email: "", upn: "u@s.com" })).toBe("u@s.com");
    expect(emailDoPerfil({ email: "sem-arroba", preferred_username: "p@s.com" })).toBe("p@s.com");
    expect(emailDoPerfil({})).toBeNull();
    expect(emailDoPerfil(undefined)).toBeNull();
  });
  it("avaliarLogin diz o motivo: tenant, sem-email, fora-da-lista, erro-banco", async () => {
    await db.insert(users).values({ email: "ana@exemplo.com.br", nome: "Ana", role: "admin" });
    expect(await avaliarLogin("ana@exemplo.com.br", TENANT_ID)).toEqual({ ok: true });
    expect(await avaliarLogin("ana@exemplo.com.br", "outro")).toEqual({ ok: false, motivo: "tenant" });
    expect(await avaliarLogin(null, TENANT_ID)).toEqual({ ok: false, motivo: "sem-email" });
    expect(await avaliarLogin("bia@exemplo.com.br", TENANT_ID)).toEqual({ ok: false, motivo: "fora-da-lista" });
    const quebrado = { select: () => { throw new Error("sem banco"); } } as never;
    expect(await avaliarLogin("ana@exemplo.com.br", TENANT_ID, quebrado)).toEqual({ ok: false, motivo: "erro-banco" });
  });
  it("mascararEmail não expõe o endereço inteiro", () => {
    expect(mascararEmail("mitzrael.tassinari@santolinseguros.com.br")).toBe("mi***@santolinseguros.com.br");
    expect(mascararEmail(null)).toBe("(vazio)");
  });
});

describe("rotas públicas não consultam o banco", () => {
  it("ehPublica não toca no db; proxy usa ehPublica antes de usuarioDaSessao", async () => {
    const espiao = vi.fn(() => { throw new Error("db consultado"); });
    setDb({ select: espiao } as never);
    for (const p of ["/entrar", "/sem-acesso", "/api/auth/session"]) expect(ehPublica(p)).toBe(true);
    expect(ehPublica("/api/dados")).toBe(false);
    expect(espiao).not.toHaveBeenCalled();
    setDb(db);
    const fonte = (await import("node:fs")).readFileSync("src/proxy.ts", "utf8");
    expect(fonte.indexOf("ehPublica(pathname)")).toBeLessThan(fonte.indexOf("usuarioDaSessao(req"));
  });
});

describe("página de erro do Auth.js", () => {
  it("/erro-login é pública", () => {
    expect(ehPublica("/erro-login")).toBe(true);
  });
  it("codigoErroAuth: AccessDenied vai para /sem-acesso; outros códigos ficam visíveis; valor inseguro vira Default", () => {
    expect(codigoErroAuth("AccessDenied")).toEqual({ destino: "/sem-acesso" });
    expect(codigoErroAuth("Configuration")).toEqual({ codigo: "Configuration" });
    expect(codigoErroAuth(["Verification", "x"])).toEqual({ codigo: "Verification" });
    expect(codigoErroAuth(undefined)).toEqual({ codigo: "Default" });
    expect(codigoErroAuth("<script>")).toEqual({ codigo: "Default" });
  });
});
