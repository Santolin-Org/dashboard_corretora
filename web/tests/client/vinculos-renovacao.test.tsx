// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useVinculosRenovacao } from "@/client/vinculos-renovacao";
import { comAtribuicoes } from "@/client/atribuicoes";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { VinculoRenovacao } from "@/domain/vinculos-renovacao";

// Dados fictícios.
const V1: VinculoRenovacao = { seg: "S", apolice: "A1", fim: "2026-11-15", renSeg: "S", renApolice: "R1", renVig: "2026-11-14", por: "g", em: "2026-11-13T00:00:00Z" };
const novo = { seg: "S", apolice: "A1", fim: "2026-11-15", renSeg: "S", renApolice: "R2", renVig: "2026-11-20" };
const json = (corpo: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(corpo), { status }));
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useVinculosRenovacao", () => {
  it("busca ao ativar; 503 → lista vazia e erro", async () => {
    fetchMock.mockImplementation(() => json({ vinculos: [V1] }));
    const { result } = renderHook(() => useVinculosRenovacao(true));
    await waitFor(() => expect(result.current.vinculos).toEqual([V1]));
    expect(fetchMock).toHaveBeenCalledWith("/api/vinculos-renovacao", expect.objectContaining({ credentials: "same-origin" }));
    fetchMock.mockImplementation(() => json({ erro: "x" }, 503));
    const r2 = renderHook(() => useVinculosRenovacao(true));
    await waitFor(() => expect(r2.result.current.erro).toBe(true));
    expect(r2.result.current.vinculos).toEqual([]);
  });

  it("409 → ok:false com os conflitos, lista intacta", async () => {
    fetchMock.mockImplementationOnce(() => json({ vinculos: [V1] }));
    const { result } = renderHook(() => useVinculosRenovacao(true));
    await waitFor(() => expect(result.current.vinculos).toEqual([V1]));
    fetchMock.mockImplementationOnce(() => json({ erro: "x", conflitos: [V1] }, 409));
    let r: Awaited<ReturnType<typeof result.current.vincular>> | undefined;
    await act(async () => { r = await result.current.vincular(novo); });
    expect(r).toEqual({ ok: false, conflitos: [V1] });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ...novo, substituir: false });
    expect(result.current.vinculos).toEqual([V1]);
  });

  it("substituir → tira os desfeitos e põe o novo na lista local", async () => {
    fetchMock.mockImplementationOnce(() => json({ vinculos: [V1] }));
    const { result } = renderHook(() => useVinculosRenovacao(true));
    await waitFor(() => expect(result.current.vinculos).toEqual([V1]));
    fetchMock.mockImplementationOnce(() => json({ ok: true, desfeitos: [V1] }));
    await act(async () => { await result.current.vincular(novo, true); });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).substituir).toBe(true);
    expect(result.current.vinculos).toEqual([expect.objectContaining(novo)]);
  });

  it("desfazer remove; erro da API vira Error com a mensagem", async () => {
    fetchMock.mockImplementationOnce(() => json({ vinculos: [V1] }));
    const { result } = renderHook(() => useVinculosRenovacao(true));
    await waitFor(() => expect(result.current.vinculos).toEqual([V1]));
    fetchMock.mockImplementationOnce(() => json({ ok: true }));
    await act(async () => { await result.current.desfazer({ seg: "S", apolice: "A1", fim: "2026-11-15" }); });
    expect(result.current.vinculos).toEqual([]);
    fetchMock.mockImplementationOnce(() => json({ erro: "A renovação precisa começar até 90 dias depois do fim da apólice anterior." }, 400));
    await expect(result.current.vincular(novo)).rejects.toThrow("90 dias");
  });
});

describe("comAtribuicoes com vínculos", () => {
  it("a R vinculada à antiga atribuída ganha o responsável", () => {
    const a1 = linha({ seg: "S", apolice: "A1", vig: "2025-11-15", fim: "2026-11-15", colab: "ANA", docDigits: "111", ramo: "Auto" });
    const r1 = linha({ tipo: "R", seg: "S", apolice: "R1", vig: "2026-11-14", fim: "2027-11-14", colab: "CAIO", docDigits: "999", ramo: "Auto" });
    const base = { linhas: [a1, r1] } as unknown as BaseCliente;
    const at = [{ seg: "S", apolice: "A1", fim: "2026-11-15", para: "BIA", de: "ANA", por: "g", em: "" }];
    expect(comAtribuicoes(base, at).base.linhas[1].resp).toBeUndefined();
    expect(comAtribuicoes(base, at, [V1]).base.linhas[1].resp).toBe("BIA");
  });
});
