import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { escopoDoUsuario } from "@/server/escopo";
import { hojeDaIngestao, obterBase } from "@/server/ingestao";
import { corpoGzip, streamDe } from "@/server/corpo-dados";

// runtime: Node.js é o padrão (a opção "runtime" não é aceita com cacheComponents).
// Partida fria: lista, baixa e parseia as planilhas de produção (várias com 100 mil+ linhas).
export const maxDuration = 300;

// private: só o navegador guarda; no-cache: ele revalida (If-None-Match) antes de reusar.
const CACHE = "private, no-cache";
const VERSAO_SEM_ACESSO = "sem-acesso";

export async function GET(req: Request) {
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const escopo = escopoDoUsuario(u);
  // Escopo "nada" (vendedor na Etapa 1, sem papel): não dispara a ingestão; recebe o payload vazio.
  const b =
    escopo.tipo === "nada"
      ? {
          versao: VERSAO_SEM_ACESSO, geradoEm: "", hoje: hojeDaIngestao(), linhas: [], sinistros: [], manifesto: [],
          contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
        }
      : await obterBase();

  // ETag forte: versão + dia ("hoje" muda sem mudar a versão) + usuário + escopo (o recorte muda o corpo).
  const etag = `"${createHash("sha256").update(JSON.stringify([b.versao, b.hoje, u.email, escopo.tipo])).digest("hex").slice(0, 32)}"`;
  const candidatos = (req.headers.get("if-none-match") ?? "").split(",").map((s) => s.trim().replace(/^W\//, ""));
  if (candidatos.includes(etag) || candidatos.includes("*")) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE, Vary: "Accept-Encoding" } });
  }

  // Corpo gzip calculado uma vez por (versão, dia, escopo), enviado em streaming. O recorte de
  // escopo acontece antes de codificar (payloadDados). Ver README, "Desempenho".
  const gz = corpoGzip(b, escopo);
  const headers: Record<string, string> = {
    ETag: etag, "Cache-Control": CACHE, Vary: "Accept-Encoding", "Content-Type": "application/json; charset=utf-8",
  };
  if (/\bgzip\b/i.test(req.headers.get("accept-encoding") ?? "")) {
    return new NextResponse(streamDe(gz), { headers: { ...headers, "Content-Encoding": "gzip" } });
  }
  // Cliente sem gzip (raro: todo navegador aceita): descomprime.
  return new NextResponse(streamDe(gunzipSync(gz)), { headers });
}
