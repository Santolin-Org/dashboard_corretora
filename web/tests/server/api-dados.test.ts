import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";

vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { usuarioDaRequisicao } from "@/server/auth";
import { obterBase, definirDependencias, reiniciarIngestao } from "@/server/ingestao";
import { criarArmazemMemoria } from "@/server/snapshots";
import { PastaLocalFonte } from "@/server/fontes/pasta-local";
import { decodificarLinhas, decodificarSinistros } from "@/domain/serializacao";
import { GET, maxDuration } from "@/app/api/dados/route";
import { estatisticasCorpo, reiniciarCorpo } from "@/server/corpo-dados";
import type { ArquivoMeta, FonteArquivos } from "@/server/fontes/tipos";

const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor", email = "a@b") => ({ email, nome: "A", role, expiraEm: 9e9 });
const req = (h: Record<string, string> = {}) => new Request("http://x/api/dados", { headers: h });

let dir: string;
let hojeAtual = "2026-10-15";
beforeEach(() => {
  hojeAtual = "2026-10-15";
  dir = mkdtempSync(join(tmpdir(), "dados-"));
  gerarFixture(dir);
  reiniciarIngestao();
  reiniciarCorpo();
  definirDependencias({ fonte: () => new PastaLocalFonte(dir), armazem: criarArmazemMemoria(), hoje: () => hojeAtual, ttlNegativoMs: 0 });
  usuario.mockReset();
});
afterEach(() => {
  definirDependencias(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/dados", () => {
  it("sem sessão: 401", async () => {
    usuario.mockResolvedValue(null);
    const r = await GET(req());
    expect(r.status).toBe(401);
  });

  it("vendedor: 200 com linhas e sinistros vazios e sem manifesto/avisos", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    const r = await GET(req());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(decodificarLinhas(j.linhas)).toEqual([]);
    expect(decodificarSinistros(j.sinistros)).toEqual([]);
    expect(j.manifesto).toEqual([]);
    expect(j.avisos).toEqual([]);
    expect(j.avisosSaude).toEqual([]);
    expect(JSON.stringify(j)).not.toMatch(/producao_|\.xlsx/);
  });

  it("gestao: recebe todas as linhas e sinistros", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const b = await obterBase();
    const r = await GET(req());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(decodificarLinhas(j.linhas)).toEqual(b.linhas);
    expect(decodificarSinistros(j.sinistros)).toEqual(b.sinistros);
    expect(j.versao).toBe(b.versao);
    expect(j.hoje).toBe("2026-10-15");
    expect(j.manifesto.length).toBeGreaterThan(0);
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("If-None-Match igual ao ETag: 304 sem corpo; outro usuário não reaproveita o ETag", async () => {
    usuario.mockResolvedValue(sessao("admin", "um@x"));
    const r1 = await GET(req());
    const etag = r1.headers.get("etag")!;
    expect(etag).toMatch(/^"[^"]+"$/);
    const r2 = await GET(req({ "if-none-match": etag }));
    expect(r2.status).toBe(304);
    expect(await r2.text()).toBe("");
    expect(r2.headers.get("etag")).toBe(etag);
    usuario.mockResolvedValue(sessao("admin", "dois@x"));
    const r3 = await GET(req({ "if-none-match": etag }));
    expect(r3.status).toBe(200);
  });

  it("ETag distingue escopos: vendedor e gestao com o mesmo e-mail não compartilham", async () => {
    usuario.mockResolvedValue(sessao("gestao", "m@x"));
    const e1 = (await GET(req())).headers.get("etag");
    usuario.mockResolvedValue(sessao("vendedor", "m@x"));
    const e2 = (await GET(req())).headers.get("etag");
    expect(e1).not.toBe(e2);
  });

  it("mudou o dia (mesma versão): ETag muda e o cliente recebe 200 com o novo hoje", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    const r1 = await GET(req());
    hojeAtual = "2026-10-16";
    const r2 = await GET(req({ "if-none-match": r1.headers.get("etag")! }));
    expect(r2.status).toBe(200);
    expect((await r2.json()).hoje).toBe("2026-10-16");
  });

  it("If-None-Match aceita W/, listas e *", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    const etag = (await GET(req())).headers.get("etag")!;
    expect((await GET(req({ "if-none-match": `W/${etag}` }))).status).toBe(304);
    expect((await GET(req({ "if-none-match": `"outro", W/${etag}` }))).status).toBe(304);
    expect((await GET(req({ "if-none-match": "*" }))).status).toBe(304);
    expect((await GET(req({ "if-none-match": '"outro"' }))).status).toBe(200);
  });

  it("vendedor não recebe erroProducao, contagens nem nomes de arquivo mesmo com a base em erro", async () => {
    const vazio = mkdtempSync(join(tmpdir(), "dados-vazio-"));
    try {
      reiniciarIngestao();
      definirDependencias({ fonte: () => new PastaLocalFonte(vazio), armazem: criarArmazemMemoria(), hoje: () => hojeAtual, ttlNegativoMs: 0 });
      expect((await obterBase()).erroProducao).toBeDefined();
      usuario.mockResolvedValue(sessao("vendedor"));
      const j = await (await GET(req())).json();
      expect(j.erroProducao).toBeUndefined();
      expect(j.contagensSinistros).toEqual({ sinistrosAvisados: 0, sinistrosPagamentos: 0 });
      expect(j.manifesto).toEqual([]);
      expect(JSON.stringify(j)).not.toMatch(/erroProducao|arquivosNaPasta|\.xlsx/);
      usuario.mockResolvedValue(sessao("admin"));
      expect((await (await GET(req())).json()).erroProducao).toBeDefined();
    } finally {
      rmSync(vazio, { recursive: true, force: true });
    }
  });

  it("maxDuration cobre a partida fria (300 s)", () => {
    expect(maxDuration).toBe(300);
  });
});

describe("GET /api/dados: corpo gzip pré-computado", () => {
  const GZ = { "accept-encoding": "gzip, deflate, br" };
  const lerGzip = async (r: Response) => JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8"));

  it("com Accept-Encoding gzip: Content-Encoding gzip e o corpo descomprimido é o mesmo JSON sem compressão", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const b = await obterBase();
    const rz = await GET(req(GZ));
    expect(rz.status).toBe(200);
    expect(rz.headers.get("content-encoding")).toBe("gzip");
    expect(rz.headers.get("content-type")).toMatch(/^application\/json/);
    expect(rz.headers.get("vary")).toMatch(/accept-encoding/i);
    expect(rz.headers.get("cache-control")).toBe("private, no-cache");
    const etag = rz.headers.get("etag");
    const jz = await lerGzip(rz);
    const rp = await GET(req());
    expect(rp.headers.get("content-encoding")).toBeNull();
    expect(rp.headers.get("etag")).toBe(etag);
    const jp = await rp.json();
    expect(jz).toEqual(jp);
    expect(decodificarLinhas(jz.linhas)).toEqual(b.linhas);
    expect(decodificarSinistros(jz.sinistros)).toEqual(b.sinistros);
  });

  it("o corpo vai como stream (vários pedaços), não um buffer único", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const r = await GET(req(GZ));
    expect(r.body).toBeInstanceOf(ReadableStream);
  });

  it("codifica uma vez por (versão, dia, escopo): requisições seguintes reusam o gzip", async () => {
    usuario.mockResolvedValue(sessao("gestao", "um@x"));
    await GET(req(GZ));
    usuario.mockResolvedValue(sessao("admin", "dois@x"));
    await GET(req(GZ));
    await GET(req());
    expect(estatisticasCorpo().codificacoes).toBe(1);
    expect(estatisticasCorpo().entradas).toBe(1);
  });

  it("cache limitado: versão nova descarta o corpo da versão anterior", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    await GET(req(GZ));
    hojeAtual = "2026-10-16"; // muda o dia: corpo novo
    const r = await GET(req(GZ));
    expect((await lerGzip(r)).hoje).toBe("2026-10-16");
    expect(estatisticasCorpo().codificacoes).toBe(2);
    expect(estatisticasCorpo().entradas).toBe(1);
  });

  it("304 continua sem corpo e sem Content-Encoding", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const etag = (await GET(req(GZ))).headers.get("etag")!;
    const r = await GET(req({ ...GZ, "if-none-match": etag }));
    expect(r.status).toBe(304);
    expect(r.headers.get("content-encoding")).toBeNull();
    expect(await r.text()).toBe("");
  });

  it("escopo nada: payload vazio com semAcesso, sem disparar a ingestão", async () => {
    let listagens = 0;
    const fonte: FonteArquivos = {
      async listar(): Promise<ArquivoMeta[]> { listagens++; return []; },
      async baixar() { throw new Error("não deveria baixar"); },
    };
    reiniciarIngestao();
    definirDependencias({ fonte: () => fonte, armazem: criarArmazemMemoria(), hoje: () => hojeAtual, ttlNegativoMs: 0 });
    usuario.mockResolvedValue(sessao("vendedor"));
    const r = await GET(req(GZ));
    expect(r.status).toBe(200);
    const j = await lerGzip(r);
    expect(listagens).toBe(0);
    expect(j.semAcesso).toBe(true);
    expect(j.hoje).toBe("2026-10-15");
    expect(decodificarLinhas(j.linhas)).toEqual([]);
    expect(decodificarSinistros(j.sinistros)).toEqual([]);
    expect(j.manifesto).toEqual([]);
    const r2 = await GET(req({ "if-none-match": r.headers.get("etag")! }));
    expect(r2.status).toBe(304);
  });

  it("gestao não recebe semAcesso", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    expect((await (await GET(req())).json()).semAcesso).toBeUndefined();
  });
});
