// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";

vi.mock("chart.js/auto", () => ({ default: class { destroy() {} } }));

import { ContextoPainel } from "@/client/painel";
import { opcoesSeletor } from "@/components/painel-produtor/SeletorProdutores";
import { PainelProdutor } from "@/components/painel-produtor/PainelProdutor";
import Produtores from "@/app/(dash)/produtores/Produtores";

const A = "ANA LIMA - SANTOLIN", B = "BRUNO REIS - SANTOLIN", SD = "ALESSANDRA (OFICIAL) - SANTOLIN", IG = "IGNORADO - X";
const LINHAS = [
  linha({ colab: A, tipo: "N", vig: "2026-10-05", fim: "2027-10-05", premio: 100, com: 10, cli: "Só Ana" }),
  linha({ colab: B, tipo: "N", vig: "2026-10-06", fim: "2027-10-06", premio: 200, com: 20, cli: "Só Bruno" }),
  linha({ colab: `${A} , ${B}`, tipo: "N", vig: "2026-10-07", fim: "2027-10-07", premio: 300, com: 30, cli: "Dupla" }),
  linha({ colab: SD, tipo: "N", vig: "2026-10-08", fim: "2027-10-08", premio: 50, com: 5, cli: "Sem dono" }),
  linha({ colab: IG, tipo: "N", vig: "2026-10-09", fim: "2027-10-09", cli: "Ign" }),
];
const LISTA = { produtores: [{ id: 1, nome: "Ana Lima", nomes: [A] }, { id: 2, nome: "Bruno Reis", nomes: [B] }], ignorados: [IG] };
const fakeBase = (linhas = LINHAS) => ({ linhas, sinistros: [], hoje: "2026-10-22", manifesto: [], avisosSaude: [] }) as unknown as BaseCliente;
const Raiz = ({ children }: { children: React.ReactNode }) =>
  <ContextoPainel.Provider value={{ base: fakeBase(), recarregar: () => {}, abrirFontes: () => {} }}>{children}</ContextoPainel.Provider>;

const fetchOk = () => vi.fn(async () => ({ ok: true, json: async () => LISTA }) as Response);
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", fetchOk()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const abrir = async () => {
  render(<Raiz><Produtores /></Raiz>);
  fireEvent.click(await screen.findByRole("button", { name: "+ adicionar" }));
};
const kpi = (nome: string) => screen.getByText(nome).parentElement!.querySelector("strong")!.textContent;

describe("opcoesSeletor", () => {
  it("separa pessoas e sem dono; exclui ignorados e vinculados", () => {
    const o = opcoesSeletor(LISTA.produtores, [A, B, SD, IG].map((nome) => ({ nome, qtd: 1 })), LISTA.ignorados);
    expect(o.pessoas).toEqual([{ id: "p:1", rotulo: "Ana Lima", nomes: [A] }, { id: "p:2", rotulo: "Bruno Reis", nomes: [B] }]);
    expect(o.semDono).toEqual([{ id: `n:${SD}`, rotulo: "ALESSANDRA (OFICIAL)", nomes: [SD] }]);
  });
  it("duas pessoas com o mesmo nome de exibição têm ids distintos (id do usuário)", () => {
    const o = opcoesSeletor([{ id: 7, nome: "Ana", nomes: [A] }, { id: 9, nome: "Ana", nomes: [B] }], [], []);
    expect(o.pessoas.map((p) => p.id)).toEqual(["p:7", "p:9"]);
  });
});

describe("Página Produtores", () => {
  it("sem seleção pede para escolher", async () => {
    render(<Raiz><Produtores /></Raiz>);
    expect(await screen.findByText("Escolha um ou mais produtores.")).toBeTruthy();
  });

  it("dois produtores com apólice em dupla: Apólices conta uma vez; títulos sem 'Minha'", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText("Ana Lima"));
    fireEvent.click(screen.getByLabelText("Bruno Reis"));
    expect(kpi("Apólices")).toBe("3"); // Só Ana + Só Bruno + Dupla (1x)
    expect(document.body.textContent).toContain("Produção em outubro");
    expect(document.body.textContent).not.toContain("Minha produção");
    expect(document.body.textContent).toContain("Produção em 2026, mês a mês");
  });

  it("remover a etiqueta desmarca", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText("Ana Lima"));
    expect(kpi("Apólices")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Remover Ana Lima" }));
    expect(screen.getByText("Escolha um ou mais produtores.")).toBeTruthy();
    expect((screen.getByLabelText("Ana Lima") as HTMLInputElement).checked).toBe(false);
  });

  it("busca ignora caixa e acento; nome sem dono usa forma curta com título completo", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("Buscar produtor"), { target: { value: "alessándra" } });
    expect(screen.queryByLabelText("Ana Lima")).toBeNull();
    fireEvent.click(screen.getByLabelText("ALESSANDRA (OFICIAL)"));
    const chip = screen.getByRole("button", { name: "Remover ALESSANDRA (OFICIAL)" }).parentElement!;
    expect(chip.getAttribute("title")).toBe(SD);
    expect(screen.queryByLabelText(IG)).toBeNull();
  });

  it("o menu fecha com Esc e com clique fora; clique dentro não fecha", async () => {
    await abrir();
    fireEvent.mouseDown(screen.getByLabelText("Buscar produtor"));
    expect(screen.getByLabelText("Buscar produtor")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("Buscar produtor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ adicionar" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Buscar produtor")).toBeNull();
  });

  it("restaura a seleção do localStorage e descarta id inexistente", async () => {
    localStorage.setItem("produtores:selecao", JSON.stringify(["p:2", "p:99", "p:Bruno Reis"]));
    render(<Raiz><Produtores /></Raiz>);
    await waitFor(() => expect(kpi("Apólices")).toBe("2"));
    expect(JSON.parse(localStorage.getItem("produtores:selecao")!)).toEqual(["p:2"]); // id antigo (p:{nome}) e inexistente são descartados
  });

  it("erro na lista mostra aviso e tenta de novo", async () => {
    const f = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValue({ ok: true, json: async () => LISTA });
    vi.stubGlobal("fetch", f);
    render(<Raiz><Produtores /></Raiz>);
    expect(await screen.findByText(/Não foi possível carregar a lista de produtores\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Escolha um ou mais produtores.")).toBeTruthy();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("PainelProdutor: títulos", () => {
  it("padrão mantém 'Minha produção'; prefixo 'Produção' remove 'Minha'", () => {
    const { unmount } = render(<Raiz><PainelProdutor nomes={new Set([A])} mostrarDono={false} saudacao="Olá" /></Raiz>);
    expect(document.body.textContent).toContain("Minha produção em outubro");
    expect(document.body.textContent).toContain("Minha produção em 2026, mês a mês");
    unmount();
    render(<Raiz><PainelProdutor nomes={new Set([A])} mostrarDono={false} saudacao={null} prefixoTitulo="Produção" /></Raiz>);
    expect(document.body.textContent).not.toContain("Minha");
    expect(within(document.body).getByText(/^Produção em outubro/)).toBeTruthy();
  });
});
