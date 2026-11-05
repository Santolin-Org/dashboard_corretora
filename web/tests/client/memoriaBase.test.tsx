// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBase } from "@/client/useBase";
import { chaveDono, definirMemoriaBase, memoriaIndexedDb, type MemoriaBase, type Salva } from "@/client/memoriaBase";
import { esquecerUsuario } from "@/client/usuario";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";
import { linha } from "../domain/helpers";

const corpo = (versao: string, cli: string) => ({
  versao, geradoEm: "t", hoje: "2026-10-15", linhas: codificarLinhas([linha({ cli })]), sinistros: codificarSinistros([]),
  manifesto: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
});
const json = (status: number, body: unknown, etag?: string) =>
  new Response(JSON.stringify(body), { status, headers: etag ? { etag } : {} });
const EU = { email: "Ana@x.com", nome: "Ana", role: "vendedor" as const, nomes: ["B", "A"] };

let guardada: Salva<unknown> | null;
const memoria: MemoriaBase & { apagar: ReturnType<typeof vi.fn> } = {
  disponivel: () => true,
  ler: async <C,>() => guardada as Salva<C> | null,
  gravar: async (s) => { guardada = s; },
  apagar: vi.fn(async () => { guardada = null; }),
};

/** /api/eu responde na hora; /api/dados fica pendurado até `soltarDados`. */
let soltarDados: (r: Response) => void;
let eu: unknown;
const padrao = (url: string) => {
  if (url === "/api/eu") return Promise.resolve(json(200, eu));
  return new Promise<Response>((res) => { soltarDados = res; });
};
const fetchMock = vi.fn(padrao);

beforeEach(() => {
  guardada = null;
  eu = EU;
  memoria.apagar.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(padrao);
  esquecerUsuario();
  definirMemoriaBase(memoria);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { definirMemoriaBase(null); vi.unstubAllGlobals(); });

describe("chaveDono", () => {
  it("ignora maiúsculas do e-mail e a ordem dos vínculos; muda com papel ou vínculos", () => {
    const k = chaveDono(EU);
    expect(chaveDono({ ...EU, email: "ana@x.com", nomes: ["A", "B"] })).toBe(k);
    expect(chaveDono({ ...EU, role: "gestao" })).not.toBe(k);
    expect(chaveDono({ ...EU, nomes: ["A"] })).not.toBe(k);
    expect(chaveDono({ ...EU, email: "bia@x.com" })).not.toBe(k);
  });
});

describe("abertura instantânea", () => {
  it("mostra a cópia salva do mesmo usuário enquanto o servidor não responde; depois troca e salva a nova", async () => {
    guardada = { dono: chaveDono(EU), salvoEm: 1000, corpo: corpo("v1", "Salvo") };
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(result.current.base?.linhas[0].cli).toBe("Salvo"));
    expect(result.current.estado).toBe("pronto");
    expect(result.current.daMemoriaDe).toBe(1000);
    await act(async () => { soltarDados(json(200, corpo("v2", "Novo"), '"v2"')); });
    await waitFor(() => expect(result.current.base?.linhas[0].cli).toBe("Novo"));
    expect(result.current.daMemoriaDe).toBeUndefined();
    await waitFor(() => expect((guardada?.corpo as { versao: string }).versao).toBe("v2"));
    expect(guardada?.dono).toBe(chaveDono(EU));
  });

  it("cópia de outro usuário (ou com outro papel/vínculos) não aparece", async () => {
    guardada = { dono: chaveDono({ ...EU, email: "outra@x.com" }), salvoEm: 1, corpo: corpo("v1", "Outra") };
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/eu", expect.anything()));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(result.current.base).toBeUndefined();
    expect(result.current.estado).toBe("carregando");
  });

  it("sem login (/api/eu falha) a cópia não aparece", async () => {
    guardada = { dono: chaveDono(EU), salvoEm: 1, corpo: corpo("v1", "Salvo") };
    fetchMock.mockImplementation((url: string) => (url === "/api/eu"
      ? Promise.resolve(json(401, { erro: "x" }))
      : new Promise<Response>((res) => { soltarDados = res; })));
    const { result } = renderHook(() => useBase());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(result.current.base).toBeUndefined();
  });

  it("servidor respondeu antes: a cópia salva não sobrescreve a base nova", async () => {
    let soltarLeitura!: () => void;
    guardada = { dono: chaveDono(EU), salvoEm: 1, corpo: corpo("v1", "Salvo") };
    const lenta = { ...memoria, ler: <C,>() => new Promise<Salva<C> | null>((r) => { soltarLeitura = () => r(guardada as Salva<C>); }) };
    definirMemoriaBase(lenta);
    const { result } = renderHook(() => useBase());
    await act(async () => { soltarDados(json(200, corpo("v2", "Novo"), '"v2"')); });
    await waitFor(() => expect(result.current.base?.linhas[0].cli).toBe("Novo"));
    await act(async () => { soltarLeitura(); await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.base?.linhas[0].cli).toBe("Novo");
    expect(result.current.daMemoriaDe).toBeUndefined();
  });

  it("falha do servidor com a cópia na tela: mantém a cópia e marca o erro", async () => {
    guardada = { dono: chaveDono(EU), salvoEm: 5, corpo: corpo("v1", "Salvo") };
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(result.current.daMemoriaDe).toBe(5));
    await act(async () => { soltarDados(json(500, { erro: "x" })); });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.base?.linhas[0].cli).toBe("Salvo");
    expect(result.current.daMemoriaDe).toBe(5);
  });

  it("vendedor sem vínculo (semAcesso) não é salvo", async () => {
    const { result } = renderHook(() => useBase());
    await act(async () => { soltarDados(json(200, { ...corpo("sem-acesso", "x"), semAcesso: true }, '"s"')); });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(guardada).toBeNull();
  });

  it("cópia ilegível é apagada", async () => {
    guardada = { dono: chaveDono(EU), salvoEm: 1, corpo: { linhas: "lixo" } };
    renderHook(() => useBase());
    await waitFor(() => expect(memoria.apagar).toHaveBeenCalled());
  });
});

describe("memoriaIndexedDb sem IndexedDB (jsdom)", () => {
  it("não está disponível e nunca lança", async () => {
    expect(memoriaIndexedDb.disponivel()).toBe(false);
    await expect(memoriaIndexedDb.ler()).resolves.toBeNull();
    await expect(memoriaIndexedDb.gravar({ dono: "", salvoEm: 0, corpo: {} })).resolves.toBeUndefined();
    await expect(memoriaIndexedDb.apagar()).resolves.toBeUndefined();
  });
});
