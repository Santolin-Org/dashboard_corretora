import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { escopoDoUsuario, podeReprocessar } from "@/server/escopo";
import { obterBase } from "@/server/ingestao";

// runtime: Node.js é o padrão (a opção "runtime" não é aceita com cacheComponents).

export async function GET() {
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  if (escopoDoUsuario(u).tipo === "nada") return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const b = await obterBase();
  return NextResponse.json({
    podeReprocessar: podeReprocessar(u),
    versao: b.versao,
    geradoEm: b.geradoEm,
    manifesto: b.manifesto,
    contagensSinistros: b.contagensSinistros,
    avisos: b.avisos,
    avisosSaude: b.avisosSaude,
    ...(b.erroProducao ? { erroProducao: b.erroProducao } : {}),
  });
}
