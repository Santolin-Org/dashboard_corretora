// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";
import { linha } from "../domain/helpers";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/visao-geral",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { AvisoDadosSalvos, AvisoSessao, AvisoSemConexao } from "@/components/AvisoSessao";
import { Casca } from "@/components/Casca";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import { INTERVALO_REVALIDACAO_MS } from "@/client/useBase";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const corpo = (versao: string, cli: string) => ({
  versao, geradoEm: "t", hoje: "2026-10-15", linhas: codificarLinhas([linha({ cli })]), sinistros: codificarSinistros([]),
  manifesto: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
});
const resp = (status: number, body?: unknown, etag?: string) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:07:00Z"));
  fetchMock.mockReset(); signIn.mockReset(); vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/visao-geral?f=%7B%22seg%22%3A%5B%22Allianz%22%5D%7D");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("AvisoSessao", () => {
  it("texto exato com o horário local e botão que chama signIn com a URL atual", () => {
    const t = new Date("2026-10-20T15:07:00Z").getTime();
    render(<AvisoSessao desde={t} />);
    expect(document.getElementById("aviso-sessao")!.textContent).toBe(`Sua sessão expirou — os dados podem estar desatualizados desde ${hhmm(t)}.Entrar novamente`);
    fireEvent.click(screen.getByRole("button", { name: "Entrar novamente" }));
    expect(signIn).toHaveBeenCalledWith("microsoft-entra-id", { callbackUrl: window.location.href });
    expect(signIn.mock.calls[0][1].callbackUrl).toContain("f=");
  });
  it("aviso de sem conexão é outro elemento", () => {
    const t = new Date("2026-10-20T15:07:00Z").getTime();
    render(<AvisoSemConexao desde={t} />);
    expect(document.getElementById("aviso-sem-conexao")!.textContent).toBe(`Sem conexão com o servidor desde ${hhmm(t)}`);
  });
});

function Sonda() {
  const { filtros } = useFiltros();
  const { base } = usePainel();
  return <p id="sonda">{base.versao}|{base.linhas[0].cli}|{filtros.seg.join(",")}</p>;
}
const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("Casca com revalidação", () => {
  it("nova versão troca a base e preserva filtros e rota", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1", "Ana"), '"v1:a"'));
    render(<Casca><Sonda /></Casca>);
    await avancar(0);
    expect(document.getElementById("sonda")!.textContent).toBe("v1|Ana|Allianz");
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v2", "Bia"), '"v2:a"'));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(document.getElementById("sonda")!.textContent).toBe("v2|Bia|Allianz");
    expect(window.location.pathname).toBe("/visao-geral");
    expect(window.location.search).toContain("Allianz");
    expect(document.getElementById("aviso-sessao")).toBeNull();
  });

  it("401 mantém os dados na tela e mostra o aviso com o horário da última carga boa", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1", "Ana"), '"v1:a"'));
    render(<Casca><Sonda /></Casca>);
    await avancar(0);
    const t0 = Date.now();
    fetchMock.mockResolvedValueOnce(resp(401));
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(document.getElementById("sonda")!.textContent).toBe("v1|Ana|Allianz");
    expect(document.getElementById("aviso-sessao")!.textContent).toContain(`desde ${hhmm(t0)}.`);
  });

  it("falhas de rede por mais de 15 min mostram o aviso discreto, com os dados mantidos", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, corpo("v1", "Ana"), '"v1:a"'));
    render(<Casca><Sonda /></Casca>);
    await avancar(0);
    fetchMock.mockRejectedValue(new Error("offline"));
    await avancar(INTERVALO_REVALIDACAO_MS * 3);
    expect(document.getElementById("aviso-sem-conexao")).toBeNull();
    await avancar(INTERVALO_REVALIDACAO_MS);
    expect(document.getElementById("aviso-sem-conexao")!.textContent).toMatch(/^Sem conexão com o servidor desde \d\d:\d\d$/);
    expect(document.getElementById("sonda")!.textContent).toBe("v1|Ana|Allianz");
  });
});

describe("AvisoDadosSalvos", () => {
  afterEach(cleanup);
  it("diz de quando são os dados salvos e se está atualizando ou se a atualização falhou", () => {
    const em = Date.UTC(2026, 9, 28, 20, 5); // 28/10 17:05 em São Paulo
    const { rerender } = render(<AvisoDadosSalvos salvoEm={em} falhou={false} />);
    expect(screen.getByRole("status").textContent).toBe("Mostrando os dados salvos em 28/10, 17:05. Atualizando…");
    rerender(<AvisoDadosSalvos salvoEm={em} falhou />);
    expect(screen.getByRole("status").textContent).toBe("Não foi possível atualizar agora. Mostrando os dados salvos em 28/10, 17:05.");
  });
});
