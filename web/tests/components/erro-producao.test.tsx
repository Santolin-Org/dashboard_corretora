// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { codificarLinhas, codificarSinistros } from "@/domain/serializacao";
import type { Sinistro } from "@/domain/sinistros/parse";

let rota = "/visao-geral";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => rota,
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <p>conteudo-da-aba</p> }));

import { Casca } from "@/components/Casca";
import { PainelAba } from "@/components/PainelAba";
import { AbaSobDemanda } from "@/components/AbaSobDemanda";
import { RedirecionarInicio } from "@/components/RedirecionarInicio";
import { textoErroProducao } from "@/components/TelaErro";
import { esquecerUsuario } from "@/client/usuario";

const sin = (id: string): Sinistro => ({
  id, sinNum: id, abertura: "2026-01-02", aviso: "2026-01-02", encerra: "", status: "Aberto", seg: "Allianz", ramo: "Auto",
  cli: "C", valor: 10, pago: 0, impSeg: 0, franquia: 0, prejEst: 0, premioPago: 0, motivo: "", tipoSin: "", colab: "A", grp: "G",
});
const ERRO = { mensagem: "producao_2026.xlsx: planilha ilegível", arquivosNaPasta: ["producao_2026.xlsx", "sinistrosAvisados.xlsx"] };
const corpo = (o: { erro?: typeof ERRO; sinistros?: Sinistro[] }) => ({
  versao: "v", geradoEm: "t", hoje: "2026-10-15", linhas: codificarLinhas([]), sinistros: codificarSinistros(o.sinistros ?? []),
  manifesto: [], contagensSinistros: { sinistrosAvisados: (o.sinistros ?? []).length, sinistrosPagamentos: 0 }, avisos: [], avisosSaude: [],
  ...(o.erro ? { erroProducao: o.erro } : {}),
});
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); replace.mockReset(); esquecerUsuario(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// /api/eu indisponível (503): a casca segue sem o pé da barra; cada chamada recebe uma Response nova.
const responder = (b: unknown) => fetchMock.mockImplementation(async (url: string) =>
  url === "/api/eu" ? new Response("{}", { status: 503 }) : new Response(JSON.stringify(b), { status: 200 }));

const ESPERADO = "producao_2026.xlsx: planilha ilegível A pasta Dashboard contém: producao_2026.xlsx, sinistrosAvisados.xlsx.";

describe("erro de produção com sinistros presentes", () => {
  it("textoErroProducao acrescenta a listagem da pasta, sem repetir quando a mensagem já traz", () => {
    expect(textoErroProducao(ERRO)).toBe(ESPERADO);
    const m = "Nenhuma planilha de produção encontrada. Os arquivos devem se chamar producao_<ano>.xlsx (ex.: producao_2021.xlsx). A pasta Dashboard contém: x.xlsx.";
    expect(textoErroProducao({ mensagem: m, arquivosNaPasta: ["x.xlsx"] })).toBe(m);
  });

  for (const aba of ["visao-geral", "producao", "retencao", "crosssell", "comparativo", "metas"]) {
    it(`aba ${aba}: mostra o erro no lugar do conteúdo; cabeçalho como updateDashHeader`, async () => {
      rota = `/${aba}`;
      responder(corpo({ erro: ERRO, sinistros: [sin("1"), sin("2")] }));
      render(<Casca><PainelAba id={aba}><p>conteudo-da-aba</p></PainelAba></Casca>);
      await waitFor(() => expect(document.getElementById(`tab-${aba}`)).not.toBeNull());
      expect(document.getElementById(`tab-${aba}`)!.textContent).toBe(ESPERADO);
      expect(screen.queryByText("conteudo-da-aba")).toBeNull();
      expect(document.getElementById("dash-subtitle")!.textContent).toBe("Sinistros: 2 (avisados 2 · pagos 0)");
      expect(document.getElementById("rec-badge")!.textContent).toBe("2 sinistros");
    });
  }

  it("Sinistros funciona normalmente", async () => {
    rota = "/sinistros";
    responder(corpo({ erro: ERRO, sinistros: [sin("1")] }));
    render(<Casca><PainelAba id="sinistros"><p>conteudo-da-aba</p></PainelAba></Casca>);
    await waitFor(() => expect(screen.getByText("conteudo-da-aba")).toBeTruthy());
    expect(document.querySelector("[data-erro-producao]")).toBeNull();
  });

  it("Exibição TV mostra o erro no lugar do conteúdo", async () => {
    rota = "/exibicao-tv";
    responder(corpo({ erro: ERRO, sinistros: [sin("1")] }));
    render(<Casca><AbaSobDemanda id="exibicao-tv" /></Casca>);
    await waitFor(() => expect(document.getElementById("tv-exibicao")).not.toBeNull());
    expect(document.getElementById("tv-exibicao")!.textContent).toBe(ESPERADO);
  });

  it("início abre a Visão geral (o erro aparece de cara), não Sinistros", async () => {
    rota = "/";
    responder(corpo({ erro: ERRO, sinistros: [sin("1")] }));
    render(<Casca><RedirecionarInicio /></Casca>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/visao-geral"));
  });

  it("sem erro e só com sinistros, o início continua indo para Sinistros", async () => {
    rota = "/";
    responder(corpo({ sinistros: [sin("1")] }));
    render(<Casca><RedirecionarInicio /></Casca>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sinistros"));
  });

  it("sem sinistros: tela de erro cheia com a mensagem e a listagem", async () => {
    rota = "/visao-geral";
    responder(corpo({ erro: ERRO }));
    render(<Casca><PainelAba id="visao-geral"><p>x</p></PainelAba></Casca>);
    await waitFor(() => expect(document.getElementById("sp-error")).not.toBeNull());
    expect(document.getElementById("sp-error")!.textContent).toBe(ESPERADO);
    expect(document.getElementById("dash")).toBeNull();
  });
});

describe("painel de fontes na casca", () => {
  it("'Ver fontes' na tela de erro abre o painel; admin vê Reprocessar fontes; Fechar fecha", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/fontes" ? new Response(JSON.stringify({ podeReprocessar: true }), { status: 200 })
        : new Response(JSON.stringify(corpo({ erro: ERRO })), { status: 200 }));
    render(<Casca><p>x</p></Casca>);
    fireEvent.click(await screen.findByText("Ver fontes"));
    expect(document.querySelector("#fontes-modal")).not.toBeNull();
    expect(await screen.findByText(/Reprocessar fontes/)).toBeTruthy();
    fireEvent.click(screen.getByText("Fechar"));
    expect(document.querySelector("#fontes-modal")).toBeNull();
  });
  it("gestão (podeReprocessar false) não vê o botão", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/fontes" ? new Response(JSON.stringify({ podeReprocessar: false }), { status: 200 })
        : new Response(JSON.stringify(corpo({ erro: ERRO })), { status: 200 }));
    render(<Casca><p>x</p></Casca>);
    fireEvent.click(await screen.findByText("Ver fontes"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/fontes", expect.anything()));
    expect(screen.queryByText(/Reprocessar fontes/)).toBeNull();
  });
});

// Mudança intencional (Task 5): a tela "acesso será liberado" (TelaSemAcesso) saiu; o vendedor sem
// vínculo recebe a casca com a barra lateral (o aviso de sem vínculo vem no Meu painel).
describe("escopo nada (semAcesso)", () => {
  it("rota /meu-painel: casca com a barra lateral e o conteúdo, sem tela de erro", async () => {
    rota = "/meu-painel";
    responder({ ...corpo({}), versao: "sem-acesso", semAcesso: true });
    render(<Casca><p>conteudo-da-pagina</p></Casca>);
    await waitFor(() => expect(screen.getByText("conteudo-da-pagina")).toBeTruthy());
    const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
    expect(nav).not.toBeNull();
    // sem /api/eu (falhou), semAcesso já diz que é vendedor: só Meu painel
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/meu-painel"]);
    expect(document.getElementById("sem-acesso-dash")).toBeNull();
    expect(document.getElementById("sp-error")).toBeNull();
    expect(document.getElementById("dash")).toBeNull();
  });
  it("início leva o vendedor sem vínculo para /meu-painel", async () => {
    rota = "/";
    responder({ ...corpo({}), versao: "sem-acesso", semAcesso: true });
    render(<Casca><RedirecionarInicio /></Casca>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/meu-painel"));
  });
});

describe("início por papel", () => {
  it("vendedor (com vínculo) vai para /meu-painel", async () => {
    rota = "/";
    fetchMock.mockImplementation(async (url: string) => url === "/api/eu"
      ? new Response(JSON.stringify({ email: "g@x.com", nome: "Gabriel", role: "vendedor", nomes: ["GABRIEL"] }), { status: 200 })
      : new Response(JSON.stringify(corpo({ sinistros: [sin("1")] })), { status: 200 }));
    render(<Casca><RedirecionarInicio /></Casca>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/meu-painel"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("gestão continua indo para a aba inicial", async () => {
    rota = "/";
    fetchMock.mockImplementation(async (url: string) => url === "/api/eu"
      ? new Response(JSON.stringify({ email: "c@x.com", nome: "Cesar", role: "gestao", nomes: [] }), { status: 200 })
      : new Response(JSON.stringify(corpo({ sinistros: [sin("1")] })), { status: 200 }));
    render(<Casca><RedirecionarInicio /></Casca>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sinistros"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("barra lateral recolhível na casca", () => {
  it("« recolhe, a escolha fica no localStorage e volta recolhida ao montar de novo", async () => {
    rota = "/visao-geral";
    localStorage.removeItem("barraLateral:recolhida");
    responder(corpo({ sinistros: [sin("1")] }));
    const { unmount } = render(<Casca><PainelAba id="visao-geral"><p>x</p></PainelAba></Casca>);
    fireEvent.click(await screen.findByRole("button", { name: "Recolher menu" }));
    expect(document.querySelector("aside")!.getAttribute("data-recolhida")).toBe("true");
    expect(localStorage.getItem("barraLateral:recolhida")).toBe("1");
    unmount();
    esquecerUsuario();
    render(<Casca><PainelAba id="visao-geral"><p>x</p></PainelAba></Casca>);
    expect(await screen.findByRole("button", { name: "Expandir menu" })).toBeTruthy();
    localStorage.removeItem("barraLateral:recolhida");
  });
});
