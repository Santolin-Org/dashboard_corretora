import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import {
  ESCOPOS,
  ISSUER_PADRAO,
  assertBypassSeguro,
  assertIssuerSeguro,
  avaliarLogin,
  emailDoPerfil,
  jwtCallback,
  mascararEmail,
  sessionCallback,
  usuarioDaSessao,
  type Sessao,
  type TokenApp,
} from "./auth-core";

export type { Sessao };

// Falha no boot se o bypass de paridade estiver ligado fora de dev/teste.
assertBypassSeguro();
assertIssuerSeguro(); // tenant fixo: env divergente derruba o boot

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/entrar", error: "/erro-login" }, // AccessDenied → /sem-acesso (erro-login)
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: ISSUER_PADRAO,
      authorization: { params: { scope: ESCOPOS } },
      // Perfil próprio: e-mail com fallback para o UPN (a claim `email` pode faltar) e sem buscar a foto no Graph.
      profile: (p) => ({ id: p.sub, name: p.name, email: emailDoPerfil(p as unknown as Record<string, unknown>) }),
    }),
  ],
  callbacks: {
    // Recusa (e manda para /sem-acesso) quem não está ativo na tabela.
    async signIn({ user, profile }) {
      const r = await avaliarLogin(user.email, (profile as { tid?: unknown } | undefined)?.tid);
      if (r.ok) return true;
      console.warn(`[auth] login recusado (${r.motivo}) para ${mascararEmail(user.email)}`);
      return "/sem-acesso";
    },
    async jwt({ token, account, user }) {
      return (await jwtCallback({ token: token as TokenApp, account, user })) as typeof token;
    },
    async session({ session, token }) {
      return sessionCallback({ session, token: token as TokenApp });
    },
  },
});

/** Usuário da requisição atual, relido do banco a cada chamada; null se não autorizado. */
export async function usuarioDaRequisicao(): Promise<Sessao | null> {
  return usuarioDaSessao((await auth()) as Parameters<typeof usuarioDaSessao>[0]);
}
