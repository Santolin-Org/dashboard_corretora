// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBase } from "@/client/useBase";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";
import { linha } from "../domain/helpers";

const corpo = (versao: string) => ({
  versao, geradoEm: "t", hoje: "2026-10-15", linhas: codificarLinhas([linha({ cli: "Zé" })]), sinistros: codificarSinistros([]),
  manifesto: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
});
const resp = (status: number, body?: unknown, etag?: string) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} });

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("useBase", () => {
  it("carrega, decodifica e fica pronto", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    expect(result.current.estado).toBe("carregando");
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(result.current.base?.linhas[0].cli).toBe("Zé");
    expect(result.current.base?.hoje).toBe("2026-10-15");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dados");
  });

  it("recarregar envia If-None-Match e 304 mantém os dados", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    const antes = result.current.base;
    fetchMock.mockResolvedValueOnce(resp(304));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("if-none-match")).toBe('"v1:a"');
    expect(result.current.estado).toBe("pronto");
    expect(result.current.base).toBe(antes);
  });

  it("401 vira sessao-expirada e preserva a última base", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    fetchMock.mockResolvedValueOnce(resp(401, { erro: "Não autenticado" }));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.estado).toBe("sessao-expirada"));
    expect(result.current.base).toBeDefined();
  });

  it("erro de rede/HTTP: estado erro; com base anterior continua disponível", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useBase());
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.erro).toMatch(/offline/);
    expect(result.current.base).toBeUndefined();
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v2"), '"v2:a"'));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    fetchMock.mockResolvedValueOnce(resp(500, { erro: "x" }));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.base).toBeDefined();
  });
});
