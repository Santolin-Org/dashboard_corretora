// Lógica de autenticação sem dependência de next-auth: testável sem Microsoft.
import { buscarUsuarioAtivo, type Db } from "./db/client";
import type { Papel } from "./db/schema";

/** `expiraEm`: expiração do access token em SEGUNDOS desde a época (epoch). */
export type Sessao = { email: string; nome: string; role: Papel; expiraEm: number };

type Env = Record<string, string | undefined>;

export const TENANT_ID = "59190e65-5cad-4885-9f2d-77a59385667b";
export const ISSUER_PADRAO = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

/** Emissor efetivo: a env só pode repetir o do tenant Santolin; qualquer outro valor lança erro. */
export function assertIssuerSeguro(env: Env = process.env): string {
  const v = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  if (v && v.replace(/\/+$/, "") !== ISSUER_PADRAO) {
    throw new Error("AUTH_MICROSOFT_ENTRA_ID_ISSUER difere do tenant autorizado");
  }
  return ISSUER_PADRAO;
}

/** E-mail do perfil Entra: a claim `email` pode faltar (ou não bater com o login) em contas M365;
 *  cai para o nome de login (preferred_username/UPN), que o tenant controla. Sempre minúsculo. */
export function emailDoPerfil(profile: Record<string, unknown> | null | undefined): string | null {
  for (const c of [profile?.email, profile?.preferred_username, profile?.upn]) {
    if (typeof c === "string" && c.includes("@")) return c.trim().toLowerCase();
  }
  return null;
}

export type ResultadoLogin = { ok: true } | { ok: false; motivo: "tenant" | "sem-email" | "fora-da-lista" | "erro-banco" };

/** signIn com o motivo da recusa (vai para o log do servidor; nunca para a tela). */
export async function avaliarLogin(email: string | null | undefined, tid: unknown, db?: Db): Promise<ResultadoLogin> {
  if (tid !== TENANT_ID) return { ok: false, motivo: "tenant" };
  if (!email) return { ok: false, motivo: "sem-email" };
  try {
    return (await buscarUsuarioAtivo(email, db)) ? { ok: true } : { ok: false, motivo: "fora-da-lista" };
  } catch {
    return { ok: false, motivo: "erro-banco" };
  }
}

/** E-mail mascarado para log: "mitzrael@x.com" → "mi***@x.com". */
export const mascararEmail = (e: string | null | undefined): string =>
  e ? e.replace(/^(.{0,2})[^@]*(@.*)?$/, (_, ini: string, dom?: string) => `${ini}***${dom ?? ""}`) : "(vazio)";

/** signIn: tenant do token deve ser o da Santolin E o e-mail estar ativo na lista. */
export async function permitirLogin(
  email: string | null | undefined,
  tid: unknown,
  db?: Db,
): Promise<boolean> {
  return (await avaliarLogin(email, tid, db)).ok;
}
export const ESCOPOS = "openid profile email offline_access User.Read";

/** Usuário sintético do bypass de paridade. */
export const USUARIO_BYPASS: Sessao = {
  email: "parity@local",
  nome: "Parity",
  role: "admin",
  expiraEm: Number.MAX_SAFE_INTEGER,
};

/** Lança se o bypass estiver ligado num ambiente que não seja desenvolvimento/teste. */
export function assertBypassSeguro(env: Env = process.env): void {
  if (env.PARITY_AUTH_BYPASS !== "1") return;
  if (env.VERCEL !== undefined) {
    throw new Error("PARITY_AUTH_BYPASS não pode ser usado com VERCEL definido");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("PARITY_AUTH_BYPASS não pode ser usado com NODE_ENV=production");
  }
}

export function bypassAtivo(env: Env = process.env): boolean {
  assertBypassSeguro(env);
  return env.PARITY_AUTH_BYPASS === "1";
}

/** signIn: só quem está ativo na tabela entra. Falha do banco recusa. */
export async function permitirEntrada(
  email: string | null | undefined,
  db?: Db,
): Promise<boolean> {
  if (!email) return false;
  try {
    return (await buscarUsuarioAtivo(email, db)) !== null;
  } catch {
    return false;
  }
}

export type SessaoJwt = {
  user?: { email?: string | null };
  expiraEm?: number;
  error?: string;
};

/** Relê o banco a cada chamada: desativar ou trocar papel vale na hora, mesmo com JWT válido. */
export async function usuarioDaSessao(
  sessao: SessaoJwt | null | undefined,
  opts: { db?: Db; env?: Env } = {},
): Promise<Sessao | null> {
  if (bypassAtivo(opts.env ?? process.env)) return USUARIO_BYPASS;
  const email = sessao?.user?.email;
  if (!sessao || !email || sessao.error) return null;
  try {
    const u = await buscarUsuarioAtivo(email, opts.db);
    if (!u) return null;
    return { email: u.email, nome: u.nome, role: u.role, expiraEm: sessao.expiraEm ?? 0 };
  } catch {
    return null;
  }
}

// ---- Refresh token rotativo ----

export type TokenApp = {
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  /** Segundos desde a época. */
  expiresAt?: number;
  error?: "RefreshFailed";
  [k: string]: unknown;
};

type DepsRefresh = { fetch?: typeof fetch; agora?: () => number; env?: Env };

export async function renovarToken(token: TokenApp, deps: DepsRefresh = {}): Promise<TokenApp> {
  const env = deps.env ?? process.env;
  const falha: TokenApp = { ...token, error: "RefreshFailed" };
  if (!token.refreshToken) return falha;
  // Tenant fixo: a env do emissor só pode repetir ISSUER_PADRAO (assertIssuerSeguro).
  const url = `${ISSUER_PADRAO.replace(/\/v2\.0$/, "")}/oauth2/v2.0/token`;
  try {
    const resp = await (deps.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
        client_secret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        scope: ESCOPOS,
      }).toString(),
    });
    if (!resp.ok) return falha;
    const dados = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!dados.access_token || typeof dados.expires_in !== "number") return falha;
    const { error: _descartado, ...resto } = token;
    void _descartado;
    return {
      ...resto,
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor((deps.agora ?? Date.now)() / 1000) + dados.expires_in,
    };
  } catch {
    return falha;
  }
}

/** Margem para renovar antes do vencimento (segundos). */
const MARGEM_S = 120;

export async function jwtCallback(
  args: {
    token: TokenApp;
    account?: { access_token?: string; refresh_token?: string; expires_at?: number } | null;
    user?: { email?: string | null } | null;
  },
  deps: DepsRefresh = {},
): Promise<TokenApp> {
  const { token, account, user } = args;
  if (account) {
    return {
      ...token,
      email: (user?.email ?? token.email)?.toLowerCase(),
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
    };
  }
  if (token.error === "RefreshFailed") return token;
  const agora = Math.floor((deps.agora ?? Date.now)() / 1000);
  if (typeof token.expiresAt === "number" && agora < token.expiresAt - MARGEM_S) return token;
  return renovarToken(token, deps);
}

/** A sessão só expõe e-mail, expiração e erro: nunca os tokens. */
export function sessionCallback<S extends { user?: { email?: string | null } }>(args: {
  session: S;
  token: TokenApp;
}): S & { expiraEm?: number; error?: string } {
  const { session, token } = args;
  return {
    ...session,
    user: { ...session.user, email: token.email ?? session.user?.email },
    expiraEm: token.expiresAt,
    ...(token.error ? { error: token.error } : {}),
  };
}

// ---- Decisão do proxy ----

const PAGINAS_PUBLICAS = new Set(["/entrar", "/sem-acesso", "/erro-login", "/favicon.ico"]);

/** `?error=` da página de erro do Auth.js: AccessDenied (fora da lista) vai para /sem-acesso; os demais
 *  (Configuration, Verification…) aparecem com o código, para não mascarar erro de configuração. */
export function codigoErroAuth(v: string | string[] | undefined): { destino: "/sem-acesso" } | { codigo: string } {
  const c = Array.isArray(v) ? v[0] : v;
  if (c === "AccessDenied") return { destino: "/sem-acesso" };
  return { codigo: c && /^[A-Za-z]{1,40}$/.test(c) ? c : "Default" };
}
const PREFIXOS_PUBLICOS = ["/api/auth/", "/_next/static/", "/_next/image"];

export function ehPublica(pathname: string): boolean {
  return (
    !pathname.includes("..") &&
    (PAGINAS_PUBLICAS.has(pathname) || PREFIXOS_PUBLICOS.some((p) => pathname.startsWith(p)))
  );
}

export function decidirAcesso(
  pathname: string,
  usuario: Sessao | null,
): "passar" | "401" | "entrar" {
  if (ehPublica(pathname)) return "passar";
  if (usuario) return "passar";
  return pathname === "/api" || pathname.startsWith("/api/") ? "401" : "entrar";
}
