import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { podeReprocessar } from "@/server/escopo";
import { reprocessarTudo } from "@/server/ingestao";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  if (!podeReprocessar(u)) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const b = await reprocessarTudo();
  return NextResponse.json({
    versao: b.versao,
    geradoEm: b.geradoEm,
    manifesto: b.manifesto,
    contagensSinistros: b.contagensSinistros,
    avisos: b.avisos,
    avisosSaude: b.avisosSaude,
    ...(b.erroProducao ? { erroProducao: b.erroProducao } : {}),
  });
}
