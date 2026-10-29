import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { nomesDoUsuario } from "@/server/db/client";
import { chaveEscopo, escopoDoUsuario } from "@/server/escopo";
import { hojeDaIngestao, obterBase, temposUltimaMontagem } from "@/server/ingestao";
import { cabecalhoServerTiming, etapasDaMontagem, type Etapa } from "@/server/tempos";
import { corpoGzip, streamDe } from "@/server/corpo-dados";

// runtime: Node.js é o padrão (a opção "runtime" não é aceita com cacheComponents).
// Partida fria: lista, baixa e parseia as planilhas de produção (várias com 100 mil+ linhas).
export const maxDuration = 300;

// private: só o navegador guarda; no-cache: ele revalida (If-None-Match) antes de reusar.
const CACHE = "private, no-cache";
const VERSAO_SEM_ACESSO = "sem-acesso";

export async function GET(req: Request) {
  const t0 = performance.now();
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  // Vínculos só para vendedor; banco fora → 503 (nunca cai para um escopo maior).
  let nomes: string[] = [];
  if (u.role === "vendedor") {
    try {
      nomes = await nomesDoUsuario(u.email);
    } catch {
      return NextResponse.json({ erro: "Banco indisponível" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  const escopo = escopoDoUsuario(u, nomes);
  const etapas: Etapa[] = [{ nome: "sessao", ms: performance.now() - t0, desc: "login e vínculos" }];
  const seqAntes = temposUltimaMontagem()?.seq;
  const tBase = performance.now();
  // Escopo "nada" (vendedor sem vínculo): não dispara a ingestão; recebe o payload vazio.
  const b =
    escopo.tipo === "nada"
      ? {
          versao: VERSAO_SEM_ACESSO, geradoEm: "", hoje: hojeDaIngestao(), linhas: [], sinistros: [], manifesto: [],
          contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
        }
      : await obterBase();
  // Montagem nova durante esta requisição: detalha as etapas; senão a base veio da memória.
  const tempos = temposUltimaMontagem();
  const montou = !!tempos && tempos.seq !== seqAntes;
  etapas.push({ nome: "base", ms: performance.now() - tBase, desc: montou ? "montada" : "em memória" });
  if (montou) etapas.push(...etapasDaMontagem(tempos));

  // ETag forte: versão + dia ("hoje" muda sem mudar a versão) + usuário + escopo com os nomes (o recorte muda o corpo;
  // trocar o vínculo invalida o ETag).
  const etag = `"${createHash("sha256").update(JSON.stringify([b.versao, b.hoje, u.email, chaveEscopo(escopo)])).digest("hex").slice(0, 32)}"`;
  const candidatos = (req.headers.get("if-none-match") ?? "").split(",").map((s) => s.trim().replace(/^W\//, ""));
  const fechar = (): string => {
    const h = cabecalhoServerTiming([...etapas, { nome: "total", ms: performance.now() - t0 }]);
    if (montou) console.info("[dados] tempos", h); // aparece nos logs da Vercel
    return h;
  };
  if (candidatos.includes(etag) || candidatos.includes("*")) {
    return new NextResponse(null, {
      status: 304, headers: { ETag: etag, "Cache-Control": CACHE, Vary: "Accept-Encoding", "Server-Timing": fechar() },
    });
  }

  // Corpo gzip calculado uma vez por (versão, dia, escopo), enviado em streaming. O recorte de
  // escopo acontece antes de codificar (payloadDados). Ver README, "Desempenho".
  const tGzip = performance.now();
  const gz = corpoGzip(b, escopo);
  etapas.push({ nome: "gzip", ms: performance.now() - tGzip, desc: `${(gz.length / 1e6).toFixed(2)} MB` });
  const headers: Record<string, string> = {
    "Server-Timing": fechar(), ETag: etag, "Cache-Control": CACHE, Vary: "Accept-Encoding", "Content-Type": "application/json; charset=utf-8",
  };
  if (/\bgzip\b/i.test(req.headers.get("accept-encoding") ?? "")) {
    return new NextResponse(streamDe(gz), { headers: { ...headers, "Content-Encoding": "gzip" } });
  }
  // Cliente sem gzip (raro: todo navegador aceita): descomprime.
  return new NextResponse(streamDe(gunzipSync(gz)), { headers });
}
