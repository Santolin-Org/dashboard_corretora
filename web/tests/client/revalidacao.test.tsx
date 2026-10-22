// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useBase, INTERVALO_REVALIDACAO_MS, LIMITE_SEM_CONEXAO_MS } from "@/client/useBase";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";
import { linha } from "../domain/helpers";

const corpo = (versao: string) => ({
  versao, geradoEm: "t", hoje: "2026-10-15", linhas: codificarLinhas([linha({ cli: "Zé" })]), sinistros: codificarSinistros([]),
  manifesto: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
});
const resp = (status: number, body?: unknown, etag?: string) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} });
const fetchMock = vi.fn();
const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("revalidação periódica", () => {
  it("a cada 5 min revalida com If-None-Match; 304 mantém pronto e atualiza a última carga boa", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await avancar(0);
    const t0 = result.current.ultimaBoaEm!;
    expect(INTERVALO_REVALIDACAO_MS).toBe(300000);
    fetchMock.mockResolvedValueOnce(resp(304));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("if-none-match")).toBe('"v1:a"');
    expect(result.current.estado).toBe("pronto");
    expect(result.current.ultimaBoaEm).toBe(t0 + INTERVALO_REVALIDACAO_MS);
  });

  it("401 na revalidação: sessao-expirada, base mantida e ultimaBoaEm da última carga boa", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await avancar(0);
    const t0 = result.current.ultimaBoaEm;
    fetchMock.mockResolvedValueOnce(resp(401, { erro: "x" }));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(result.current.estado).toBe("sessao-expirada");
    expect(result.current.base?.versao).toBe("v1");
    expect(result.current.ultimaBoaEm).toBe(t0);
  });

  it("200 com outra versão troca a base sem passar por carregando", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await avancar(0);
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v2"), '"v2:a"'));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(result.current.base?.versao).toBe("v2");
    expect(result.current.estado).toBe("pronto");
  });

  it("volta a ficar pronto quando a sessão é renovada depois de um 401", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await avancar(0);
    fetchMock.mockResolvedValueOnce(resp(401));
    await avancar(INTERVALO_REVALIDACAO_MS);
    fetchMock.mockResolvedValueOnce(resp(304));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(result.current.estado).toBe("pronto");
  });

  it("revalida ao voltar a ficar visível e ao ficar online; não revalida oculta", async () => {
    fetchMock.mockResolvedValue(resp(304));
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    renderHook(() => useBase());
    await avancar(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const vis = vi.spyOn(document, "visibilityState", "get");
    vis.mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vis.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vis.mockRestore();
  });

  it("desmontar para o intervalo", async () => {
    fetchMock.mockResolvedValue(resp(200, corpo("v1"), '"v1:a"'));
    const { unmount } = renderHook(() => useBase());
    await avancar(0);
    unmount();
    await avancar(INTERVALO_REVALIDACAO_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falhas de rede por mais de 15 min expõem semConexaoDesde; sucesso limpa", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1"), '"v1:a"'));
    const { result } = renderHook(() => useBase());
    await avancar(0);
    fetchMock.mockRejectedValue(new Error("offline"));
    const inicioFalha = Date.now() + INTERVALO_REVALIDACAO_MS;
    await avancar(INTERVALO_REVALIDACAO_MS * 3); // 5, 10 e 15 min: 10 min de falha
    expect(result.current.semConexaoDesde).toBeUndefined();
    await avancar(INTERVALO_REVALIDACAO_MS); // 20 min: 15 min desde a primeira falha
    expect(LIMITE_SEM_CONEXAO_MS).toBe(15 * 60 * 1000);
    expect(result.current.semConexaoDesde).toBe(inicioFalha);
    expect(result.current.base?.versao).toBe("v1");
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(resp(304));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(result.current.semConexaoDesde).toBeUndefined();
  });
});
