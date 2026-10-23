import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { decidirAcesso, ehPublica, respostaDoProxy, usuarioDaSessao } from "@/server/auth-core";

// Barreira de rede: nada além das rotas públicas passa sem usuário ativo na lista.
// Regras por papel em decidirAcesso. As rotas/páginas de dados também devem chamar usuarioDaRequisicao()
// e recortar pelo escopo (defesa em profundidade).
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (ehPublica(pathname)) return NextResponse.next(); // sem consulta ao banco
  const usuario = await usuarioDaSessao(req.auth as Parameters<typeof usuarioDaSessao>[0]);
  const r = respostaDoProxy(decidirAcesso(pathname, usuario), pathname);
  if (r.tipo === "seguir") return NextResponse.next();
  if (r.tipo === "json") return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.redirect(new URL(r.para, req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
