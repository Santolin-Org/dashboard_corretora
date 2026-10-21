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
import { obterBase, definirDependencias, reiniciarIngestao, reprocessarTudo } from "@/server/ingestao";
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
  // ttlListagemMs: 0 — estes testes mudam a pasta entre chamadas e esperam a listagem nova na hora.
  definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0, ttlListagemMs: 0 });
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
    definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0 });
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
    definirDependencias({ fonte: () => fonte, armazem, hoje: () => "2026-10-16", ttlNegativoMs: 0 });
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
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0 });
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
      ttlNegativoMs: 0,
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
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0 });
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

  it("arquivo ilegível é falha determinística: não reparseia enquanto a tag for a mesma", async () => {
    parse.mockImplementation(() => {
      throw new Error("planilha corrompida");
    });
    const b = await obterBase();
    expect(b.erroProducao?.mensagem).toContain("planilha corrompida");
    const chamadas = parse.mock.calls.length;
    const listar = vi.spyOn(fonte, "listar");
    const b2 = await obterBase();
    expect(parse.mock.calls.length).toBe(chamadas);
    expect(b2).toBe(b);
    // salvar o arquivo de novo (tag nova) invalida
    parse.mockReset();
    const real = await vi.importActual<typeof import("@/domain/producao/parse")>("@/domain/producao/parse");
    parse.mockImplementation(real.parseProducao);
    const t = new Date(Date.now() + 60_000);
    for (const f of readdirSync(dir)) utimesSync(join(dir, f), t, t);
    expect((await obterBase()).erroProducao).toBeUndefined();
    expect(listar).toHaveBeenCalled();
  });

  it("falha de rede usa TTL curto e depois tenta de novo", async () => {
    let falha = true;
    let listagens = 0;
    const f2: FonteArquivos = {
      listar: async () => {
        listagens++;
        if (falha) throw new ErroFonte("rede", "sem rede");
        return fonte.listar();
      },
      baixar: (a) => fonte.baixar(a),
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 50 });
    const b = await obterBase();
    expect(await obterBase()).toBe(b);
    expect(listagens).toBe(1);
    falha = false;
    await new Promise((r) => setTimeout(r, 70));
    expect((await obterBase()).erroProducao).toBeUndefined();
  });

  it("listagem falha com base boa em memória: segue servindo-a, com aviso", async () => {
    let falha = false;
    const f2: FonteArquivos = {
      listar: async () => {
        if (falha) throw new ErroFonte("rede", "sem rede");
        return fonte.listar();
      },
      baixar: (a) => fonte.baixar(a),
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0, ttlListagemMs: 0 });
    const ok = await obterBase();
    falha = true;
    const b = await obterBase();
    expect(b.linhas.length).toBe(ok.linhas.length);
    expect(b.erroProducao).toBeUndefined();
    expect(b.avisos).toContain("sem rede");
  });

  it("404 no download é ignorado sem aviso", async () => {
    const f2: FonteArquivos = {
      listar: () => fonte.listar(),
      baixar: async (a) => {
        if (a.nome === "producao_2025.xlsx" || a.nome === "sinistrosPagamentos.xlsx") throw new ErroFonte("pasta", "nf", 404);
        return fonte.baixar(a);
      },
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0 });
    const b = await obterBase();
    expect(b.avisos).toEqual([]);
    expect(b.manifesto.filter((m) => m.nome.startsWith("producao"))).toHaveLength(2);
  });

  it("poda snapshots de tags antigas depois de uma montagem completa", async () => {
    await obterBase();
    const t = new Date(Date.now() + 60_000);
    utimesSync(join(dir, "producao_2025.xlsx"), t, t);
    await obterBase();
    const prodKeys = armazem.chaves().filter((k) => k.startsWith("prod/"));
    expect(prodKeys).toHaveLength(3);
    expect(prodKeys.filter((k) => k.startsWith("prod/producao_2025.xlsx@"))).toHaveLength(1);
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

describe("fonte única por processo e TTL da listagem", () => {
  const contar = (ttlListagemMs?: number) => {
    const n = { criadas: 0, listagens: 0 };
    definirDependencias({
      fonte: () => {
        n.criadas++;
        return { listar: async () => { n.listagens++; return fonte.listar(); }, baixar: (a) => fonte.baixar(a) };
      },
      armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0, ...(ttlListagemMs === undefined ? {} : { ttlListagemMs }),
    });
    return n;
  };

  it("várias montagens usam a mesma instância da fonte (token/drive do Graph preservados)", async () => {
    const n = contar(0);
    await obterBase();
    await obterBase();
    await obterBase({ forcar: true });
    expect(n.criadas).toBe(1);
    expect(n.listagens).toBe(3);
  });

  it("padrão: a listagem vale 30 s (requisições seguidas não listam de novo)", async () => {
    const n = contar();
    const b1 = await obterBase();
    const b2 = await obterBase();
    expect(n.listagens).toBe(1);
    expect(b2).toBe(b1);
  });

  it("listagem expirada lista de novo", async () => {
    const n = contar(30_000);
    const agora = vi.spyOn(Date, "now");
    try {
      agora.mockReturnValue(1_000_000);
      await obterBase();
      agora.mockReturnValue(1_000_000 + 29_999);
      await obterBase();
      expect(n.listagens).toBe(1);
      agora.mockReturnValue(1_000_000 + 30_001);
      await obterBase();
      expect(n.listagens).toBe(2);
    } finally {
      agora.mockRestore();
    }
  });

  it("reprocessamento forçado ignora o TTL da listagem", async () => {
    const n = contar(30_000);
    await obterBase();
    await obterBase({ forcar: true });
    expect(n.listagens).toBe(2);
    await reprocessarTudo();
    expect(n.listagens).toBe(3);
    await obterBase(); // a listagem do reprocessamento vale para as próximas
    expect(n.listagens).toBe(3);
  });

  it("falha de listagem não fica guardada", async () => {
    let falha = true;
    let listagens = 0;
    definirDependencias({
      fonte: () => ({
        listar: async () => { listagens++; if (falha) throw new ErroFonte("rede", "sem rede"); return fonte.listar(); },
        baixar: (a) => fonte.baixar(a),
      }),
      armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0, ttlListagemMs: 30_000,
    });
    expect((await obterBase()).erroProducao).toBeDefined();
    falha = false;
    expect((await obterBase()).erroProducao).toBeUndefined();
    expect(listagens).toBe(2);
  });

  it("produção em paralelo (até 2 por vez) mantém a ordem da listagem no resultado", async () => {
    const real = await vi.importActual<typeof import("@/domain/producao/parse")>("@/domain/producao/parse");
    let ativos = 0;
    let pico = 0;
    const ordemChegada: string[] = [];
    const atrasos: Record<string, number> = { "producao_2024.xlsx": 40, "producao_2025.xlsx": 5, "producao_2026.xlsx": 1 };
    const nomes = (await fonte.listar()).filter((m) => m.nome.startsWith("producao")).map((m) => m.nome);
    expect(nomes.length).toBe(3);
    definirDependencias({
      fonte: () => ({
        listar: () => fonte.listar(),
        baixar: async (a) => {
          if (!a.nome.startsWith("producao")) return fonte.baixar(a);
          ativos++;
          pico = Math.max(pico, ativos);
          await new Promise((r) => setTimeout(r, atrasos[a.nome] ?? 1));
          ordemChegada.push(a.nome);
          ativos--;
          return fonte.baixar(a);
        },
      }),
      armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0, ttlListagemMs: 0,
    });
    const b = await obterBase();
    expect(pico).toBe(2);
    expect(ordemChegada[0]).not.toBe(nomes[0]); // o primeiro da lista terminou depois: rodaram juntos
    expect(b.manifesto.filter((m) => m.nome.startsWith("producao")).map((m) => m.nome)).toEqual(nomes);
    // mesmo resultado da montagem sequencial (base de referência sem atrasos)
    reiniciarIngestao();
    definirDependencias({ fonte: () => fonte, armazem: criarArmazemMemoria(), hoje: () => "2026-10-15", ttlNegativoMs: 0, ttlListagemMs: 0 });
    parse.mockImplementation(real.parseProducao);
    const ref = await obterBase();
    expect(b.linhas).toEqual(ref.linhas);
    expect(b.versao).toBe(ref.versao);
  });
});

describe("reprocessarTudo", () => {
  it("só apaga os snapshots depois que a montagem em andamento termina", async () => {
    const f0 = fonte;
    let solta!: () => void;
    const trava = new Promise<void>((r) => (solta = r));
    const f2: FonteArquivos = {
      listar: () => f0.listar(),
      baixar: async (a) => {
        await trava;
        return f0.baixar(a);
      },
    };
    definirDependencias({ fonte: () => f2, armazem, hoje: () => "2026-10-15", ttlNegativoMs: 0 });
    const antes = obterBase();
    const repro = reprocessarTudo();
    await new Promise((r) => setTimeout(r, 20));
    solta();
    await antes;
    const b = await repro;
    expect(b.erroProducao).toBeUndefined();
    expect(armazem.chaves().filter((k) => k.startsWith("prod/"))).toHaveLength(3);
    expect(parse).toHaveBeenCalledTimes(6); // 3 da primeira + 3 da forçada, que usou snapshots já apagados
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
  it("500 em JSON quando o reprocessamento lança", async () => {
    usuario.mockResolvedValue(sessao("admin"));
    definirDependencias({ fonte: () => fonte, armazem: { ...armazem, apagarTudo: async () => { throw new Error("blob fora"); } }, hoje: () => "2026-10-15" });
    const r = await POST();
    expect(r.status).toBe(500);
    expect((await r.json()).erro).toBeTruthy();
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
