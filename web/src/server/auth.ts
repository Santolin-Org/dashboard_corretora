import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import {
  ESCOPOS,
  ISSUER_PADRAO,
  assertBypassSeguro,
  assertIssuerSeguro,
  jwtCallback,
  permitirLogin,
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
  pages: { signIn: "/entrar", error: "/sem-acesso" },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: ISSUER_PADRAO,
      authorization: { params: { scope: ESCOPOS } },
    }),
  ],
  callbacks: {
    // Recusa (e manda para /sem-acesso) quem não está ativo na tabela.
    async signIn({ user, profile }) {
      return (await permitirLogin(user.email, (profile as { tid?: unknown } | undefined)?.tid)) ? true : "/sem-acesso";
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
