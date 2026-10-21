import { createHash } from "node:crypto";
import type { DataISO, Linha } from "@/domain/tipos";
import { parseProducao } from "@/domain/producao/parse";
import { montarBase, type FonteProducao, type ManifestoFonte } from "@/domain/producao/base";
import { parseSaude, SAUDE_FILE, type SaudeParse } from "@/domain/saude/parse";
import { montarSinistros, type Sinistro } from "@/domain/sinistros/parse";
import { criarFonte } from "./fontes";
import { ErroFonte, isProducaoFileName, type ArquivoMeta, type FonteArquivos } from "./fontes/tipos";
import { codificarLinhas, criarArmazem, decodificarLinhas, type ArmazemSnapshots } from "./snapshots";
import { hojeServidor } from "./hoje";

export type Base = {
  versao: string; // hash de (nome, tag) de todos os arquivos usados
  geradoEm: string;
  hoje: DataISO;
  linhas: Linha[];
  manifesto: ManifestoFonte[];
  avisosSaude: string[];
  sinistros: Sinistro[];
  contagensSinistros: { sinistrosAvisados: number; sinistrosPagamentos: number };
  avisos: string[]; // ex.: 'sinistrosPagamentos.xlsx: HTTP 500'
  erroProducao?: { mensagem: string; arquivosNaPasta: string[] };
};

export type Dependencias = {
  fonte: () => FonteArquivos;
  armazem: ArmazemSnapshots;
  hoje: () => DataISO;
  /** Quanto tempo uma falha de rede/HTTP é servida sem tentar de novo (padrão 30 s). */
  ttlNegativoMs?: number;
};

const SIN_AVISADOS = "sinistrosAvisados.xlsx";
const SIN_PAGAMENTOS = "sinistrosPagamentos.xlsx";

// ── Estado do processo ────────────────────────────────────────────────────────
let deps: Dependencias | null = null; // injeção para testes
// Base em memória, chaveada por (arquivos, dia). Guarda também falhas determinísticas
// (arquivo ilegível), que só mudam quando o arquivo é salvo de novo (tag nova).
let atual: { chave: string; hoje: DataISO; base: Base } | null = null;
// Falha de rede/HTTP: servida por um TTL curto para não martelar Graph/armazém a cada requisição.
let negativo: { ate: number; base: Base } | null = null;
let emAndamento: Promise<Base> | null = null;
let forcadaEmAndamento: { p: Promise<Base>; limpa: boolean } | null = null;
// Sinistros e saúde são pequenos: ficam em memória por nome@tag (não vão ao armazém).
const buffers = new Map<string, ArrayBuffer>();

export function definirDependencias(d: Dependencias | null): void {
  deps = d;
}

/** Zera o estado do processo (testes). */
export function reiniciarIngestao(): void {
  atual = null;
  negativo = null;
  emAndamento = null;
  forcadaEmAndamento = null;
  buffers.clear();
}

function dependencias(): Dependencias {
  return deps ?? { fonte: criarFonte, armazem: criarArmazem(), hoje: hojeServidor };
}

/** "Hoje" da ingestão (o mesmo que a base usaria), sem montar a base. */
export function hojeDaIngestao(): DataISO {
  try {
    return dependencias().hoje();
  } catch {
    return hojeServidor();
  }
}

const hash = (partes: unknown) => createHash("sha256").update(JSON.stringify(partes)).digest("hex").slice(0, 16);

const msgErro = (e: unknown): string =>
  e instanceof ErroFonte && e.codigo === "http" && e.status ? `HTTP ${e.status}` : e instanceof Error ? e.message : String(e);

function mensagemSemProducao(nomes: string[]): string {
  const achados = nomes.length ? ` A pasta Dashboard contém: ${nomes.join(", ")}.` : "";
  return `Nenhuma planilha de produção encontrada. Os arquivos devem se chamar producao_<ano>.xlsx (ex.: producao_2021.xlsx).${achados}`;
}

function baseVazia(hoje: DataISO, parcial: Partial<Base>): Base {
  return {
    versao: hash(["vazia", parcial.erroProducao?.mensagem ?? ""]),
    geradoEm: new Date().toISOString(),
    hoje,
    linhas: [],
    manifesto: [],
    avisosSaude: [],
    sinistros: [],
    contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 },
    avisos: [],
    ...parcial,
  };
}

const chaveProd = (a: ArquivoMeta) => `prod/${a.nome}@${a.tag}`;

async function baixarFixo(fonte: FonteArquivos, a: ArquivoMeta | undefined, avisos: string[], redeFalhou: { v: boolean }): Promise<ArrayBuffer | null> {
  if (!a) return null; // ausente não é erro (o app antigo ignorava o 404)
  const k = `${a.nome}@${a.tag}`;
  const em = buffers.get(k);
  if (em) return em;
  try {
    const b = await fonte.baixar(a);
    buffers.set(k, b);
    return b;
  } catch (e) {
    if (e instanceof ErroFonte && e.status === 404) return null; // sumiu entre a listagem e o download: como no app antigo, ignora
    avisos.push(`${a.nome}: ${msgErro(e)}`);
    redeFalhou.v = true;
    return null;
  }
}

async function carregarProducao(
  fonte: FonteArquivos,
  armazem: ArmazemSnapshots,
  a: ArquivoMeta,
): Promise<Linha[]> {
  const chave = chaveProd(a);
  try {
    const snap = await armazem.ler(chave);
    if (snap) return decodificarLinhas(snap);
  } catch {
    // snapshot ilegível ou armazém fora do ar: reparseia
  }
  const linhas = parseProducao(await fonte.baixar(a));
  try {
    await armazem.gravar(chave, codificarLinhas(linhas));
  } catch (e) {
    console.warn("[ingestao] não gravou snapshot", chave, e);
  }
  return linhas;
}

type Resultado = {
  base: Base;
  /** ok/det: vai para a base em memória; rede: só TTL curto (ou volta à última base boa). */
  modo: "ok" | "det" | "rede";
  chave?: string;
  podarProd?: Set<string>;
};

async function montar(forcar: boolean): Promise<Resultado> {
  let d: Dependencias;
  let hoje: DataISO;
  let metas: ArquivoMeta[];
  let fonte: FonteArquivos;
  const falhaInicial = (e: unknown, h: DataISO): Resultado => ({
    base: baseVazia(h, { erroProducao: { mensagem: msgErro(e), arquivosNaPasta: [] } }),
    modo: "rede",
  });
  try {
    d = dependencias();
    hoje = d.hoje();
  } catch (e) {
    return falhaInicial(e, hojeServidor());
  }
  try {
    fonte = d.fonte();
    metas = await fonte.listar(); // uma listagem por montagem: as tags usadas são as dela
  } catch (e) {
    return falhaInicial(e, hoje);
  }

  const prod = metas.filter((m) => isProducaoFileName(m.nome));
  const fixo = (n: string) => metas.find((m) => m.nome === n);
  const sinAv = fixo(SIN_AVISADOS);
  const sinPg = fixo(SIN_PAGAMENTOS);
  const saudeMeta = fixo(SAUDE_FILE);
  const usados = [...prod, sinAv, sinPg, saudeMeta].filter((m): m is ArquivoMeta => !!m);
  const versaoArquivos = hash(usados.map((m) => [m.nome, m.tag]));

  if (!forcar && atual && atual.chave === versaoArquivos && atual.hoje === hoje) {
    return { base: atual.base, modo: "ok" };
  }
  if (forcar) buffers.clear();
  const vivos = new Set(usados.map((m) => `${m.nome}@${m.tag}`));
  for (const k of [...buffers.keys()]) if (!vivos.has(k)) buffers.delete(k);

  const avisos: string[] = [];
  const rede = { v: false }; // houve falha de rede/HTTP (transitória)?
  let erroProducao: Base["erroProducao"];

  // Produção: um snapshot por arquivo; só o que mudou é reparseado.
  const fontes: FonteProducao[] = [];
  for (const a of prod) {
    try {
      fontes.push({ nome: a.nome, linhas: await carregarProducao(fonte, d.armazem, a), modificadoEm: a.modificadoEm });
    } catch (e) {
      if (e instanceof ErroFonte) {
        if (e.status !== 404) {
          // 404: como no app antigo, o arquivo é ignorado sem aviso
          avisos.push(`${a.nome}: ${msgErro(e)}`);
          rede.v = true;
        }
      } else {
        // arquivo ilegível: não montar a base com um ano faltando em silêncio
        erroProducao = { mensagem: `${a.nome}: ${msgErro(e)}`, arquivosNaPasta: metas.map((m) => m.nome) };
        break;
      }
    }
  }
  if (!erroProducao && !fontes.length) {
    erroProducao = prod.length
      ? { mensagem: `Não foi possível ler nenhuma planilha de produção (${avisos.join("; ")}).`, arquivosNaPasta: metas.map((m) => m.nome) }
      : { mensagem: mensagemSemProducao(metas.map((m) => m.nome)), arquivosNaPasta: metas.map((m) => m.nome) };
  }

  // Sinistros e saúde seguem mesmo sem produção.
  const [bufAv, bufPg, bufSaude] = [
    await baixarFixo(fonte, sinAv, avisos, rede),
    await baixarFixo(fonte, sinPg, avisos, rede),
    await baixarFixo(fonte, saudeMeta, avisos, rede),
  ];
  let sinistros: Sinistro[] = [];
  let contagens = { sinistrosAvisados: 0, sinistrosPagamentos: 0 };
  try {
    ({ sinistros, contagens } = montarSinistros(bufAv, bufPg));
  } catch (e) {
    avisos.push(`sinistros: ${msgErro(e)}`);
  }
  let saude: SaudeParse | null = null;
  if (bufSaude && saudeMeta) {
    try {
      saude = { ...parseSaude(bufSaude), modificadoEm: saudeMeta.modificadoEm };
    } catch (e) {
      avisos.push(`${SAUDE_FILE}: ${msgErro(e)}`);
    }
  }

  let linhas: Linha[] = [];
  let manifesto: ManifestoFonte[] = [];
  let avisosSaude: string[] = [];
  if (!erroProducao) {
    try {
      ({ linhas, manifesto, avisosSaude } = montarBase(fontes, saude, hoje));
    } catch (e) {
      erroProducao = { mensagem: `Falha ao montar a base: ${msgErro(e)}`, arquivosNaPasta: metas.map((m) => m.nome) };
    }
  }

  // Falha de rede/HTTP é transitória (TTL curto). Arquivo ilegível é determinístico: depende só de
  // (nome, tag) e fica em memória até o arquivo ser salvo de novo.
  const comFalha = avisos.length > 0 || (!!erroProducao && prod.length > 0);
  const base: Base = {
    versao: comFalha ? hash([versaoArquivos, avisos, erroProducao?.mensagem]) : versaoArquivos,
    geradoEm: new Date().toISOString(),
    hoje,
    linhas,
    manifesto,
    avisosSaude,
    sinistros,
    contagensSinistros: contagens,
    avisos,
    ...(erroProducao ? { erroProducao } : {}),
  };
  return {
    base,
    modo: rede.v ? "rede" : comFalha ? "det" : "ok",
    chave: versaoArquivos,
    podarProd: !rede.v && prod.length ? new Set(prod.map(chaveProd)) : undefined,
  };
}

async function executar(forcar: boolean): Promise<Base> {
  const d = dependencias();
  if (!forcar && negativo && Date.now() < negativo.ate) return negativo.base;
  const r = await montar(forcar);
  // A base só é trocada depois de montada por inteiro.
  if (r.modo === "rede") {
    const ttl = d.ttlNegativoMs ?? 30_000;
    let base = r.base;
    if (!r.chave && atual) {
      // listagem falhou mas há uma base boa: continua servindo-a, com o aviso
      base = { ...atual.base, avisos: [...atual.base.avisos, r.base.erroProducao?.mensagem ?? "falha ao listar a pasta"] };
    }
    negativo = { ate: Date.now() + ttl, base };
    return base;
  }
  negativo = null;
  atual = { chave: r.chave!, hoje: r.base.hoje, base: r.base };
  if (r.podarProd) {
    // remove snapshots de tags antigas (equivalente ao _cachePrune do app antigo)
    try {
      const velhos = (await d.armazem.listar("prod/")).filter((k) => !r.podarProd!.has(k));
      if (velhos.length) await d.armazem.apagar(velhos);
    } catch (e) {
      console.warn("[ingestao] poda de snapshots falhou", e);
    }
  }
  return r.base;
}

function encadear(limpa: boolean): Promise<Base> {
  const anterior = emAndamento;
  const p: Promise<Base> = (anterior ? anterior.catch(() => undefined) : Promise.resolve()).then(async () => {
    // apagar só depois que a montagem anterior terminou: ela poderia gravar depois da limpeza
    if (limpa) await dependencias().armazem.apagarTudo();
    negativo = null;
    return executar(true);
  });
  const encerra = () => {
    if (forcadaEmAndamento?.p === p) forcadaEmAndamento = null;
    if (emAndamento === p) emAndamento = null;
  };
  forcadaEmAndamento = { p, limpa };
  emAndamento = p;
  p.then(encerra, encerra);
  return p;
}

/**
 * Base da produção. Chamadas simultâneas compartilham uma única montagem em andamento;
 * `forcar` ignora a base em memória (os snapshots só somem com `reprocessarTudo`).
 */
export function obterBase(opts?: { forcar?: boolean }): Promise<Base> {
  if (opts?.forcar) return forcadaEmAndamento?.p ?? encadear(false);
  if (emAndamento) return emAndamento;
  const p: Promise<Base> = executar(false);
  const encerra = () => {
    if (emAndamento === p) emAndamento = null;
  };
  emAndamento = p;
  p.then(encerra, encerra);
  return p;
}

/**
 * Reprocessamento forçado: apaga os snapshots e remonta tudo.
 * Atenção: só renova a instância (processo) que atendeu a chamada; as demais renovam
 * quando uma tag mudar, ou na próxima reinicialização.
 */
export function reprocessarTudo(): Promise<Base> {
  if (forcadaEmAndamento?.limpa) return forcadaEmAndamento.p;
  return encadear(true);
}
