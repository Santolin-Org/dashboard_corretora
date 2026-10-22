import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { decidirAcesso, ehPublica, usuarioDaSessao } from "@/server/auth-core";

// Barreira de rede: nada além das rotas públicas passa sem usuário ativo na lista.
// As rotas/páginas de dados também devem chamar usuarioDaRequisicao() (defesa em profundidade).
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (ehPublica(pathname)) return NextResponse.next(); // sem consulta ao banco
  const usuario = await usuarioDaSessao(req.auth as Parameters<typeof usuarioDaSessao>[0]);
  switch (decidirAcesso(pathname, usuario)) {
    case "passar":
      return NextResponse.next();
    case "401":
      return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    default:
      return NextResponse.redirect(new URL("/entrar", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
