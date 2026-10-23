import { gzipSync } from "node:zlib";
import type { Base } from "./ingestao";
import { aplicarEscopo, chaveEscopo, type Escopo } from "./escopo";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";

/**
 * Corpo de /api/dados já em gzip, calculado uma vez por (versão, dia, escopo).
 * Com dados reais o JSON colunar passa de 19 MB (150 mil linhas), acima do limite de 4,5 MB
 * de corpo de resposta das Vercel Functions; em gzip fica perto de 1,8 MB. Ver README, "Desempenho".
 * Cache por escopo: uma entrada por chave de escopo distinta (`chaveEscopo`) dentro do `versão|hoje`
 * atual; quando `versão|hoje` muda, o cache inteiro é limpo. Escopos diferentes não se apagam.
 */
type Entrada = { gzip: Buffer };

let chaveBase: string | null = null;
const cache = new Map<string, Entrada>();
let codificacoes = 0;

/** O recorte de escopo acontece ANTES de codificar: quem não tem escopo nunca recebe as linhas.
 *  Vendedor (escopo colaboradores) recebe só as linhas com um dos seus nomes e nenhum sinistro.
 *  Manifesto/avisos (nomes de arquivos, contagens, erros) e sinistros só vão para quem vê tudo. */
export function payloadDados(b: Pick<Base, "versao" | "geradoEm" | "hoje" | "linhas" | "sinistros" | "manifesto" | "contagensSinistros" | "avisos" | "avisosSaude" | "erroProducao">, escopo: Escopo) {
  const tudo = escopo.tipo === "tudo";
  return {
    versao: b.versao,
    geradoEm: b.geradoEm,
    hoje: b.hoje,
    linhas: codificarLinhas(aplicarEscopo(b.linhas, escopo)),
    sinistros: codificarSinistros(tudo ? b.sinistros : []),
    manifesto: tudo ? b.manifesto : [],
    contagensSinistros: tudo ? b.contagensSinistros : { sinistrosAvisados: 0, sinistrosPagamentos: 0 },
    avisos: tudo ? b.avisos : [],
    avisosSaude: tudo ? b.avisosSaude : [],
    ...(tudo && b.erroProducao ? { erroProducao: b.erroProducao } : {}),
    ...(escopo.tipo === "nada" ? { semAcesso: true as const } : {}),
  };
}

/** gzip do JSON de `payloadDados(b, escopo)`, reusado enquanto (versão, dia) não mudar. */
export function corpoGzip(b: Parameters<typeof payloadDados>[0], escopo: Escopo): Buffer {
  const cb = `${b.versao}|${b.hoje}`;
  if (cb !== chaveBase) {
    cache.clear();
    chaveBase = cb;
  }
  const k = chaveEscopo(escopo);
  let e = cache.get(k);
  if (!e) {
    codificacoes++;
    e = { gzip: gzipSync(JSON.stringify(payloadDados(b, escopo)), { level: 6 }) };
    cache.set(k, e);
  }
  return e.gzip;
}

const PEDACO = 64 * 1024;

/** Stream em pedaços de 64 KB (resposta em streaming nas Vercel Functions). */
export function streamDe(buf: Buffer): ReadableStream<Uint8Array> {
  let pos = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (pos >= buf.length) {
        c.close();
        return;
      }
      const fim = Math.min(pos + PEDACO, buf.length);
      c.enqueue(new Uint8Array(buf.buffer, buf.byteOffset + pos, fim - pos));
      pos = fim;
    },
  });
}

export function estatisticasCorpo() {
  return { codificacoes, entradas: cache.size };
}

/** Zera o cache (testes). */
export function reiniciarCorpo(): void {
  cache.clear();
  chaveBase = null;
  codificacoes = 0;
}
