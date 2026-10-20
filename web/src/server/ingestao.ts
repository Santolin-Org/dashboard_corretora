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

export type Dependencias = { fonte: () => FonteArquivos; armazem: ArmazemSnapshots; hoje: () => DataISO };

const SIN_AVISADOS = "sinistrosAvisados.xlsx";
const SIN_PAGAMENTOS = "sinistrosPagamentos.xlsx";

// ── Estado do processo ────────────────────────────────────────────────────────
let deps: Dependencias | null = null; // injeção para testes
let atual: Base | null = null; // última base completa (sem falha transitória)
let emAndamento: Promise<Base> | null = null;
let forcadaEmAndamento: Promise<Base> | null = null;
// Sinistros e saúde são pequenos: ficam em memória por nome@tag (não vão ao armazém).
const buffers = new Map<string, ArrayBuffer>();

export function definirDependencias(d: Dependencias | null): void {
  deps = d;
}

/** Zera o estado do processo (testes). */
export function reiniciarIngestao(): void {
  atual = null;
  emAndamento = null;
  forcadaEmAndamento = null;
  buffers.clear();
}

function dependencias(): Dependencias {
  return deps ?? { fonte: criarFonte, armazem: criarArmazem(), hoje: hojeServidor };
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

async function baixarFixo(fonte: FonteArquivos, a: ArquivoMeta | undefined, avisos: string[]): Promise<ArrayBuffer | null> {
  if (!a) return null; // ausente não é erro (o app antigo ignorava o 404)
  const k = `${a.nome}@${a.tag}`;
  const em = buffers.get(k);
  if (em) return em;
  try {
    const b = await fonte.baixar(a);
    buffers.set(k, b);
    return b;
  } catch (e) {
    avisos.push(`${a.nome}: ${msgErro(e)}`);
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

/** Retorna a base e se ela pode ser guardada em memória (sem falha transitória). */
async function montar(forcar: boolean): Promise<{ base: Base; cacheavel: boolean }> {
  let d: Dependencias;
  let hoje: DataISO;
  let metas: ArquivoMeta[];
  let fonte: FonteArquivos;
  try {
    d = dependencias();
    hoje = d.hoje();
    fonte = d.fonte();
  } catch (e) {
    return {
      base: baseVazia(hojeServidor(), { erroProducao: { mensagem: msgErro(e), arquivosNaPasta: [] } }),
      cacheavel: false,
    };
  }
  try {
    metas = await fonte.listar(); // uma listagem por montagem: as tags usadas são as dela
  } catch (e) {
    return { base: baseVazia(hoje, { erroProducao: { mensagem: msgErro(e), arquivosNaPasta: [] } }), cacheavel: false };
  }

  const prod = metas.filter((m) => isProducaoFileName(m.nome));
  const fixo = (n: string) => metas.find((m) => m.nome === n);
  const sinAv = fixo(SIN_AVISADOS);
  const sinPg = fixo(SIN_PAGAMENTOS);
  const saudeMeta = fixo(SAUDE_FILE);
  const usados = [...prod, sinAv, sinPg, saudeMeta].filter((m): m is ArquivoMeta => !!m);
  const versaoArquivos = hash(usados.map((m) => [m.nome, m.tag]));

  if (!forcar && atual && atual.versao === versaoArquivos && atual.hoje === hoje) {
    return { base: atual, cacheavel: true };
  }
  if (forcar) buffers.clear();
  const vivos = new Set(usados.map((m) => `${m.nome}@${m.tag}`));
  for (const k of [...buffers.keys()]) if (!vivos.has(k)) buffers.delete(k);

  const avisos: string[] = [];
  let erroProducao: Base["erroProducao"];

  // Produção: um snapshot por arquivo; só o que mudou é reparseado.
  const fontes: FonteProducao[] = [];
  for (const a of prod) {
    try {
      fontes.push({ nome: a.nome, linhas: await carregarProducao(fonte, d.armazem, a), modificadoEm: a.modificadoEm });
    } catch (e) {
      if (e instanceof ErroFonte) avisos.push(`${a.nome}: ${msgErro(e)}`);
      else {
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
    await baixarFixo(fonte, sinAv, avisos),
    await baixarFixo(fonte, sinPg, avisos),
    await baixarFixo(fonte, saudeMeta, avisos),
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

  // Falha transitória (download, arquivo ilegível): a base é devolvida mas não fica em cache.
  const transitorio = avisos.length > 0 || (!!erroProducao && prod.length > 0);
  const base: Base = {
    versao: transitorio ? hash([versaoArquivos, avisos, erroProducao?.mensagem]) : versaoArquivos,
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
  return { base, cacheavel: !transitorio };
}

async function executar(forcar: boolean): Promise<Base> {
  const { base, cacheavel } = await montar(forcar);
  // A base só é trocada depois de montada por inteiro; falhas transitórias não ficam em cache.
  if (cacheavel) atual = base;
  return base;
}

/**
 * Base da produção. Chamadas simultâneas compartilham uma única montagem em andamento;
 * `forcar` ignora a base em memória (os snapshots só somem com `apagarTudo()` do armazém).
 */
export function obterBase(opts?: { forcar?: boolean }): Promise<Base> {
  if (opts?.forcar) {
    if (forcadaEmAndamento) return forcadaEmAndamento;
    const anterior = emAndamento;
    const p: Promise<Base> = (anterior ? anterior.catch(() => undefined) : Promise.resolve()).then(() => executar(true));
    const encerra = () => {
      if (forcadaEmAndamento === p) forcadaEmAndamento = null;
      if (emAndamento === p) emAndamento = null;
    };
    forcadaEmAndamento = p;
    emAndamento = p;
    p.then(encerra, encerra);
    return p;
  }
  if (emAndamento) return emAndamento;
  const p: Promise<Base> = executar(false);
  const encerra = () => {
    if (emAndamento === p) emAndamento = null;
  };
  emAndamento = p;
  p.then(encerra, encerra);
  return p;
}

/** Reprocessamento forçado: apaga os snapshots e remonta tudo. */
export async function reprocessarTudo(): Promise<Base> {
  await dependencias().armazem.apagarTudo();
  return obterBase({ forcar: true });
}
