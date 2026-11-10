// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { comAtribuicoes, useAtribuicoes } from "@/client/atribuicoes";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { Atribuicao } from "@/domain/atribuicoes";

const A: Atribuicao = { seg: "S", apolice: "A1", fim: "2026-11-10", para: "BIA", de: "ANA", por: "g", em: "2026-11-10T00:00:00Z" };
const json = (corpo: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(corpo), { status }));
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useAtribuicoes", () => {
  it("busca ao ativar e expõe a lista", async () => {
    fetchMock.mockImplementation(() => json({ atribuicoes: [A] }));
    const { result } = renderHook(() => useAtribuicoes(true));
    await waitFor(() => expect(result.current.atribuicoes).toEqual([A]));
    expect(result.current.erro).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/atribuicoes", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("busca de novo quando a base muda (sinal), para não ficar com a lista velha", async () => {
    fetchMock.mockImplementation(() => json({ atribuicoes: [] }));
    const { rerender } = renderHook(({ s }) => useAtribuicoes(true, s), { initialProps: { s: {} as unknown } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ s: {} });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("não busca enquanto inativo", () => {
    renderHook(() => useAtribuicoes(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("503 → lista vazia e erro", async () => {
    fetchMock.mockImplementation(() => json({ erro: "Banco indisponível" }, 503));
    const { result } = renderHook(() => useAtribuicoes(true));
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.atribuicoes).toEqual([]);
  });

  it("salvar faz PUT e atualiza a lista local; desfazer faz DELETE e remove", async () => {
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => (init?.method ? json({ ok: true }) : json({ atribuicoes: [] })));
    const { result } = renderHook(() => useAtribuicoes(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(() => result.current.salvar({ seg: "S", apolice: "A1", fim: "2026-11-10", para: "BIA", de: "ANA" }));
    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ seg: "S", apolice: "A1", fim: "2026-11-10", para: "BIA", de: "ANA" });
    expect(result.current.atribuicoes).toMatchObject([{ apolice: "A1", para: "BIA" }]);
    // Trocar o responsável da mesma vigência substitui, não duplica.
    await act(() => result.current.salvar({ seg: "S", apolice: "A1", fim: "2026-11-10", para: "CAIO", de: "ANA" }));
    expect(result.current.atribuicoes).toMatchObject([{ apolice: "A1", para: "CAIO" }]);
    await act(() => result.current.desfazer({ seg: "S", apolice: "A1", fim: "2026-11-10" }));
    expect(fetchMock.mock.calls.at(-1)![1].method).toBe("DELETE");
    expect(result.current.atribuicoes).toEqual([]);
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/dados")).toHaveLength(0);
  });

  it("falha ao salvar: lança e não muda a lista", async () => {
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => (init?.method ? json({ erro: "Sem permissão" }, 403) : json({ atribuicoes: [] })));
    const { result } = renderHook(() => useAtribuicoes(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(result.current.salvar({ seg: "S", apolice: "A1", fim: "2026-11-10", para: "BIA", de: "ANA" })).rejects.toThrow("Sem permissão");
    expect(result.current.atribuicoes).toEqual([]);
  });
});

describe("comAtribuicoes", () => {
  it("devolve a base com as linhas marcadas e as divergências; sem atribuições, a mesma base", () => {
    const antiga = linha({ seg: "S", apolice: "A1", fim: "2026-11-10", vig: "2025-11-10", colab: "ANA", docDigits: "1", ramo: "Auto" });
    const ren = linha({ tipo: "R", seg: "S", apolice: "B1", vig: "2026-11-10", fim: "2027-11-10", colab: "CAIO", docDigits: "1", ramo: "Auto" });
    const base = { linhas: [antiga, ren], hoje: "2026-11-10" } as unknown as BaseCliente;
    const r = comAtribuicoes(base, [A]);
    expect(r.base.linhas[0]).toMatchObject({ resp: "BIA", atrib: "base" });
    expect(r.base.linhas[1]).toMatchObject({ resp: "BIA", atrib: "renovacao", divergente: true });
    expect(r.divergencias).toHaveLength(1);
    expect(r.base.hoje).toBe("2026-11-10");
    const s = comAtribuicoes(base, []);
    expect(s.base).toBe(base);
    expect(s.divergencias).toEqual([]);
  });
});
