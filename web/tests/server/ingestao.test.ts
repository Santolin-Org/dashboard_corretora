import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyFileSync, mkdtempSync, rmSync, utimesSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";

vi.mock("@/domain/producao/parse", async (orig) => {
  const real = await orig<typeof import("@/domain/producao/parse")>();
  return { ...real, parseProducao: vi.fn(real.parseProducao) };
});
vi.mock("@/server/auth", () => ({ usuarioDaRequisicao: vi.fn() }));

import { parseProducao } from "@/domain/producao/parse";
import { usuarioDaRequisicao } from "@/server/auth";
import { obterBase, definirDependencias, reiniciarIngestao } from "@/server/ingestao";
import { criarArmazemMemoria } from "@/server/snapshots";
import { PastaLocalFonte } from "@/server/fontes/pasta-local";
import { ErroFonte, type ArquivoMeta, type FonteArquivos } from "@/server/fontes/tipos";
import { hojeServidor } from "@/server/hoje";
import { GET } from "@/app/api/fontes/route";
import { POST } from "@/app/api/fontes/reprocessar/route";

const parse = vi.mocked(parseProducao);
const usuario = vi.mocked(usuarioDaRequisicao);
const sessao = (role: "admin" | "gestao" | "vendedor") => ({ email: "a@b", nome: "A", role, expiraEm: 9e9 });

let dir: string;
let fonte: PastaLocalFonte;
let armazem: ReturnType<typeof criarArmazemMemoria>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ing-"));
  gerarFixture(dir);
  copyFileSync(join(dir, "producao_2024.xlsx"), join(dir, "producao_2025.xlsx"));
  fonte = new PastaLocalFonte(dir);
  armazem = criarArmazemMemoria();
  reiniciarIngestao();
  definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-15" });
  parse.mockClear();
  usuario.mockReset();
});
afterEach(() => {
  definirDependencias(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("obterBase", () => {
  it("1ª chamada parseia os 3 arquivos de produção; 2ª sem mudança não parseia nenhum", async () => {
    const b1 = await obterBase();
    expect(parse).toHaveBeenCalledTimes(3);
    expect(b1.linhas.length).toBeGreaterThan(0);
    expect(b1.sinistros.length).toBeGreaterThan(0);
    expect(b1.erroProducao).toBeUndefined();
    expect(armazem.chaves().filter((k) => k.startsWith("prod/"))).toHaveLength(3);
    parse.mockClear();
    const b2 = await obterBase();
    expect(parse).not.toHaveBeenCalled();
    expect(b2.versao).toBe(b1.versao);
  });

  it("processo novo (cache em memória vazio) lê dos snapshots sem parsear", async () => {
    const b1 = await obterBase();
    reiniciarIngestao();
    definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-15" });
    parse.mockClear();
    const b2 = await obterBase();
    expect(parse).not.toHaveBeenCalled();
    expect(b2.linhas).toEqual(b1.linhas);
    expect(b2.versao).toBe(b1.versao);
  });

  it("mudar o mtime de um arquivo reparseia só ele e muda a versão", async () => {
    const b1 = await obterBase();
    parse.mockClear();
    const t = new Date(Date.now() + 60_000);
    utimesSync(join(dir, "producao_2025.xlsx"), t, t);
    const b2 = await obterBase();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(b2.versao).not.toBe(b1.versao);
  });

  it("duas chamadas simultâneas fazem uma só montagem", async () => {
    const listar = vi.spyOn(fonte, "listar");
    const [a, b] = await Promise.all([obterBase(), obterBase()]);
    expect(listar).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(a).toBe(b);
  });

  it("muda o dia: mesma versão de arquivos, base remontada com o novo hoje", async () => {
    const b1 = await obterBase();
    definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-16" });
    const b2 = await obterBase();
    expect(b2.hoje).toBe("2026-10-16");
    expect(b2.versao).toBe(b1.versao);
  });

  it("pasta sem producao* → erroProducao com os nomes, sinistros seguem", async () => {
    for (const f of readdirSync(dir)) if (f.startsWith("producao")) unlinkSync(join(dir, f));
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toBe(
      "Nenhuma planilha de produção encontrada. Os arquivos devem se chamar producao_<ano>.xlsx " +
        "(ex.: producao_2021.xlsx). A pasta Dashboard contém: saude_fernando.xlsx, sinistrosAvisados.xlsx, sinistrosPagamentos.xlsx.",
    );
    expect(b.erroProducao?.arquivosNaPasta).toEqual([
      "saude_fernando.xlsx",
      "sinistrosAvisados.xlsx",
      "sinistrosPagamentos.xlsx",
    ]);
    expect(b.sinistros.length).toBeGreaterThan(0);
    expect(b.linhas).toEqual([]);
  });

  it("pasta vazia: mensagem sem a lista de arquivos", async () => {
    for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toBe(
      "Nenhuma planilha de produção encontrada. Os arquivos devem se chamar producao_<ano>.xlsx (ex.: producao_2021.xlsx).",
    );
    expect(b.erroProducao?.arquivosNaPasta).toEqual([]);
  });

  it("ErroFonte de auth: Base com erroProducao, sem sinistros, e não é cacheada", async () => {
    let falha = true;
    const f2: FonteArquivos = {
      listar: async () => {
        if (falha) throw new ErroFonte("auth", "Token recusado", 401);
        return fonte.listar();
      },
      baixar: (a) => fonte.baixar(a),
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15" });
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toBe("Token recusado");
    expect(b.sinistros).toEqual([]);
    falha = false;
    const b2 = await obterBase();
    expect(b2.erroProducao).toBeUndefined();
    expect(b2.linhas.length).toBeGreaterThan(0);
  });

  it("falha ao criar a fonte (credenciais ausentes) vira erroProducao", async () => {
    definirDependencias({
      fonte: () => {
        throw new ErroFonte("auth", "Credenciais do Azure ausentes");
      },
      armazem,
      hoje: () => "2026-10-15",
    });
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toBe("Credenciais do Azure ausentes");
  });

  it("falha ao baixar sinistrosPagamentos vira aviso e não é cacheada", async () => {
    let falha = true;
    const f2: FonteArquivos = {
      listar: () => fonte.listar(),
      baixar: async (a: ArquivoMeta) => {
        if (falha && a.nome === "sinistrosPagamentos.xlsx") throw new ErroFonte("http", "HTTP 500", 500);
        return fonte.baixar(a);
      },
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15" });
    const b = await obterBase();
    expect(b.avisos).toContain("sinistrosPagamentos.xlsx: HTTP 500");
    expect(b.erroProducao).toBeUndefined();
    expect(b.linhas.length).toBeGreaterThan(0);
    falha = false;
    const b2 = await obterBase();
    expect(b2.avisos).toEqual([]);
    expect(b2.contagensSinistros.sinistrosPagamentos).toBeGreaterThan(0);
    expect(b2.versao).not.toBe(b.versao);
  });

  it("montagem falha não fica em cache: a próxima chamada tenta de novo", async () => {
    parse.mockImplementationOnce(() => {
      throw new Error("planilha corrompida");
    });
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toContain("planilha corrompida");
    const b2 = await obterBase();
    expect(b2.erroProducao).toBeUndefined();
  });

  it("forcar ignora cache em memória", async () => {
    await obterBase();
    parse.mockClear();
    await obterBase({ forcar: true });
    expect(parse).toHaveBeenCalledTimes(0); // snapshots seguem valendo
    await armazem.apagarTudo();
    await obterBase({ forcar: true });
    expect(parse).toHaveBeenCalledTimes(3);
  });
});

describe("GET /api/fontes", () => {
  it("401 sem sessão", async () => {
    usuario.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("403 para vendedor", async () => {
    usuario.mockResolvedValue(sessao("vendedor"));
    expect((await GET()).status).toBe(403);
  });
  it("200 para gestao com manifesto, contagens, avisos e geradoEm", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    const r = await GET();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.manifesto.length).toBeGreaterThan(0);
    expect(j.contagensSinistros.sinistrosAvisados).toBeGreaterThan(0);
    expect(j.avisos).toEqual([]);
    expect(typeof j.geradoEm).toBe("string");
    expect(j.linhas).toBeUndefined();
  });
});

describe("POST /api/fontes/reprocessar", () => {
  it("401 sem sessão", async () => {
    usuario.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });
  it("403 para gestao e vendedor", async () => {
    usuario.mockResolvedValue(sessao("gestao"));
    expect((await POST()).status).toBe(403);
    usuario.mockResolvedValue(sessao("vendedor"));
    expect((await POST()).status).toBe(403);
  });
  it("admin apaga snapshots e remonta tudo", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    await obterBase();
    parse.mockClear();
    const r = await POST();
    expect(r.status).toBe(200);
    expect(parse).toHaveBeenCalledTimes(3);
    const j = await r.json();
    expect(j.manifesto.length).toBeGreaterThan(0);
  });
});

describe("hojeServidor", () => {
  const instante = new Date("2026-10-16T02:30:00Z"); // 23:30 de 15/10 em São Paulo
  it("usa a data civil de São Paulo, não a UTC", () => {
    expect(hojeServidor(instante, {})).toBe("2026-10-15");
  });
  it("honra PARITY_HOJE só com o bypass ativo", () => {
    expect(hojeServidor(instante, { PARITY_AUTH_BYPASS: "1", PARITY_HOJE: "2026-01-02" })).toBe("2026-01-02");
    expect(hojeServidor(instante, { PARITY_HOJE: "2026-01-02" })).toBe("2026-10-15");
  });
  it("PARITY_HOJE com bypass em produção lança", () => {
    expect(() => hojeServidor(instante, { PARITY_AUTH_BYPASS: "1", NODE_ENV: "production" })).toThrow();
  });
});
