// Lógica de autenticação sem dependência de next-auth: testável sem Microsoft.
import { buscarUsuarioAtivo, type Db } from "./db/client";
import type { Papel } from "./db/schema";

export type Sessao = { email: string; nome: string; role: Papel; expiraEm: number };

type Env = Record<string, string | undefined>;

export const ISSUER_PADRAO =
  "https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/v2.0";
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
  const issuer = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || ISSUER_PADRAO;
  const url = `${issuer.replace(/\/v2\.0\/?$/, "")}/oauth2/v2.0/token`;
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

const PAGINAS_PUBLICAS = new Set(["/entrar", "/sem-acesso", "/favicon.ico"]);
const PREFIXOS_PUBLICOS = ["/api/auth/", "/_next/static/", "/_next/image"];

export function decidirAcesso(
  pathname: string,
  usuario: Sessao | null,
): "passar" | "401" | "entrar" {
  const seguro = !pathname.includes("..");
  if (seguro && (PAGINAS_PUBLICAS.has(pathname) || PREFIXOS_PUBLICOS.some((p) => pathname.startsWith(p))))
    return "passar";
  if (usuario) return "passar";
  return pathname === "/api" || pathname.startsWith("/api/") ? "401" : "entrar";
}
