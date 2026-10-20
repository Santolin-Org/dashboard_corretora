import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { aplicarEscopo, escopoDoUsuario } from "@/server/escopo";
import { obterBase } from "@/server/ingestao";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";

export const runtime = "nodejs";
export const maxDuration = 60; // partida fria: baixa e parseia as planilhas

// private: só o navegador guarda; no-cache: ele revalida (If-None-Match) antes de reusar.
const CACHE = "private, no-cache";

export async function GET(req: Request) {
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const escopo = escopoDoUsuario(u);
  const b = await obterBase();

  // ETag forte: versão + dia ("hoje" muda sem mudar a versão) + usuário + escopo (o recorte muda o corpo).
  const etag = `"${createHash("sha256").update(JSON.stringify([b.versao, b.hoje, u.email, escopo.tipo])).digest("hex").slice(0, 32)}"`;
  const candidatos = (req.headers.get("if-none-match") ?? "").split(",").map((s) => s.trim().replace(/^W\//, ""));
  if (candidatos.includes(etag) || candidatos.includes("*")) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE } });
  }

  // O recorte acontece ANTES de codificar: quem não tem escopo nunca recebe as linhas.
  // Manifesto/avisos (nomes de arquivos, contagens, erros) só vão para quem vê tudo.
  const tudo = escopo.tipo === "tudo";
  return NextResponse.json(
    {
      versao: b.versao,
      geradoEm: b.geradoEm,
      hoje: b.hoje,
      linhas: codificarLinhas(aplicarEscopo(b.linhas, escopo)),
      sinistros: codificarSinistros(aplicarEscopo(b.sinistros, escopo)),
      manifesto: tudo ? b.manifesto : [],
      contagensSinistros: tudo ? b.contagensSinistros : { sinistrosAvisados: 0, sinistrosPagamentos: 0 },
      avisos: tudo ? b.avisos : [],
      avisosSaude: tudo ? b.avisosSaude : [],
      ...(tudo && b.erroProducao ? { erroProducao: b.erroProducao } : {}),
    },
    { headers: { ETag: etag, "Cache-Control": CACHE } },
  );
}
