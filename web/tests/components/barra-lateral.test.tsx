// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, renderHook, waitFor, act } from "@testing-library/react";
import type { BaseCliente } from "@/client/useBase";

let rota = "/producao";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => rota,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a), signIn: vi.fn() }));

import { BarraLateral, itensDaBarra } from "@/components/BarraLateral";
import { ABAS } from "@/components/Abas";
import { useUsuario, esquecerUsuario } from "@/client/usuario";

const base = {
  versao: "v", geradoEm: "", hoje: "2026-10-22", linhas: [{}], sinistros: [], manifesto: [], avisosSaude: [],
  contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [],
} as unknown as BaseCliente;
const ADMIN = { email: "a@x.com", nome: "Mitzrael Tassinari", role: "admin" as const, nomes: [] };
const VEND = { email: "g@x.com", nome: "Gabriel Veras", role: "vendedor" as const, nomes: ["GABRIEL VERAS"] };

beforeEach(() => { rota = "/producao"; push.mockReset(); signOut.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("itensDaBarra", () => {
  it("itensDaBarra por papel", () => {
    expect(itensDaBarra("vendedor")).toEqual([{ grupo: "Painéis", itens: [{ href: "/meu-painel", rotulo: "Resumo pessoal" }] }]);
    expect(itensDaBarra("gestao").map((g) => g.grupo)).toEqual(["Painéis", "Equipe", "Exibição"]);
    expect(itensDaBarra("admin").at(-1)).toEqual({ grupo: "Admin", itens: [{ href: "/admin/usuarios", rotulo: "Usuários e vínculos" }] });
  });
  it("Painéis traz as 7 abas nas mesmas rotas; Equipe e Exibição", () => {
    const g = itensDaBarra("gestao");
    expect(g[0].itens).toEqual(ABAS.map((a) => ({ href: `/${a.id}`, rotulo: a.rotulo })));
    expect(g[1].itens).toEqual([{ href: "/produtores", rotulo: "Produtores" }]);
    expect(g[2].itens.map((i) => i.rotulo)).toEqual(["Apresentação", "Exibição TV"]);
    expect(g[2].itens[0].href).toBe("/apresentacao");
    expect(itensDaBarra("admin").map((x) => x.grupo)).toEqual(["Painéis", "Equipe", "Exibição", "Admin"]);
  });
});

describe("BarraLateral recolhível", () => {
  it("botão « recolhe e » expande; recolhida esconde os textos e põe o nome no title", () => {
    const alternar = vi.fn();
    const { rerender } = render(<BarraLateral usuario={ADMIN} base={base} recolhida={false} aoAlternarRecolhida={alternar} />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }));
    expect(alternar).toHaveBeenCalledTimes(1);
    rerender(<BarraLateral usuario={ADMIN} base={base} recolhida aoAlternarRecolhida={alternar} />);
    const prod = screen.getByRole("link", { name: /Produção/ });
    expect(prod.getAttribute("title")).toBe("Produção");
    expect(document.querySelector("aside")!.getAttribute("data-recolhida")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
    expect(alternar).toHaveBeenCalledTimes(2);
  });
  it("sem aoAlternarRecolhida não há botão de recolher", () => {
    render(<BarraLateral usuario={ADMIN} base={base} />);
    expect(screen.queryByRole("button", { name: "Recolher menu" })).toBeNull();
  });
});

describe("BarraLateral", () => {
  it("marca o item ativo com aria-current", () => {
    render(<BarraLateral usuario={ADMIN} base={base} />);
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const prod = screen.getByRole("link", { name: /Produção/ });
    expect(nav.contains(prod)).toBe(true);
    expect(prod.getAttribute("aria-current")).toBe("page");
    expect(prod.getAttribute("href")).toBe("/producao");
    expect(screen.getByRole("link", { name: /Visão geral/ }).getAttribute("aria-current")).toBeNull();
    expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });
  it("rota aninhada do admin marca Usuários e vínculos", () => {
    rota = "/admin/usuarios";
    render(<BarraLateral usuario={ADMIN} base={base} />);
    expect(screen.getByRole("link", { name: /Usuários e vínculos/ }).getAttribute("aria-current")).toBe("page");
  });
  it("marca SANTOLIN / Dashboard e pé com nome, papel e Sair (signOut para /entrar)", () => {
    render(<BarraLateral usuario={ADMIN} base={base} />);
    expect(screen.getByText("Santolin")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Mitzrael Tassinari")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/entrar" });
  });
  it("vendedor vê só Resumo pessoal", () => {
    rota = "/meu-painel";
    render(<BarraLateral usuario={VEND} base={base} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/meu-painel"]);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(screen.queryByText("Exibição TV")).toBeNull();
    expect(screen.getByText("vendedor")).toBeTruthy();
  });
  it("/api/eu falhou: barra sem pé e sem grupo Admin", () => {
    render(<BarraLateral usuario={null} base={base} />);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(screen.queryByText("Usuários e vínculos")).toBeNull();
    expect(screen.getByRole("link", { name: /Produtores/ })).toBeTruthy();
  });
  it("carregando: só a marca, sem itens", () => {
    render(<BarraLateral usuario={null} carregando base={base} />);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
  });
  it("Exibição TV reaproveita o menu de escolha do painel (sem repetir os ids do cabeçalho)", () => {
    render(<BarraLateral usuario={ADMIN} base={base} />);
    const btn = screen.getByRole("button", { name: /Exibição TV/ });
    expect(btn.id).not.toBe("tv-ex-abrir");
    fireEvent.click(btn);
    expect(screen.getByRole("menu", { name: "Escolha o painel da TV" })).toBeTruthy();
  });
  it("clicar numa aba leva o ?f= dos filtros junto", () => {
    window.history.replaceState(null, "", "/producao?f=abc");
    render(<BarraLateral usuario={ADMIN} base={base} />);
    fireEvent.click(screen.getByRole("link", { name: /Metas/ }));
    expect(push).toHaveBeenCalledWith("/metas?f=abc");
    window.history.replaceState(null, "", "/");
  });
  it("☰ abre e fecha a barra (telas estreitas)", () => {
    render(<BarraLateral usuario={ADMIN} base={base} />);
    const menu = screen.getByRole("button", { name: "Abrir menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("useUsuario", () => {
  beforeEach(() => esquecerUsuario());
  it("uma busca por carga em /api/eu", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(ADMIN), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const a = renderHook(() => useUsuario());
    expect(a.result.current.carregando).toBe(true);
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    expect(a.result.current.usuario).toEqual(ADMIN);
    const b = renderHook(() => useUsuario());
    expect(b.result.current).toEqual({ usuario: ADMIN, carregando: false, falhou: false, recarregar: expect.any(Function) });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith("/api/eu", expect.anything());
  });
  it("falha (503) ou corpo sem papel válido → usuario null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const a = renderHook(() => useUsuario());
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    expect(a.result.current.usuario).toBeNull();
    esquecerUsuario();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ email: "x", role: "chefe" }), { status: 200 })));
    const b = renderHook(() => useUsuario());
    await waitFor(() => expect(b.result.current.carregando).toBe(false));
    expect(b.result.current.usuario).toBeNull();
  });
  it("falha marca falhou; recarregar busca de novo e limpa a falha", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify(VEND), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const a = renderHook(() => useUsuario());
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    expect(a.result.current).toMatchObject({ usuario: null, falhou: true });
    act(() => a.result.current.recarregar());
    await waitFor(() => expect(a.result.current.usuario).toEqual(VEND));
    expect(a.result.current.falhou).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("sinal (base) muda → busca /api/eu de novo e todos os hooks veem os nomes novos", async () => {
    const SEM = { ...VEND, nomes: [] };
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(SEM), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(VEND), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const casca = renderHook(({ sinal }) => useUsuario(sinal), { initialProps: { sinal: undefined as object | undefined } });
    const outro = renderHook(() => useUsuario());
    await waitFor(() => expect(casca.result.current.usuario).toEqual(SEM));
    casca.rerender({ sinal: { v: 1 } }); // primeira base: não busca de novo
    expect(f).toHaveBeenCalledTimes(1);
    casca.rerender({ sinal: { v: 2 } }); // base nova (ETag mudou: vínculo novo)
    await waitFor(() => expect(outro.result.current.usuario).toEqual(VEND));
    expect(casca.result.current.usuario).toEqual(VEND);
    expect(casca.result.current.carregando).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("revalidação que falha mantém o último usuário bom", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(VEND), { status: 200 }))
      .mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", f);
    const a = renderHook(({ sinal }) => useUsuario(sinal), { initialProps: { sinal: {} as object } });
    await waitFor(() => expect(a.result.current.usuario).toEqual(VEND));
    a.rerender({ sinal: {} });
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });
    expect(a.result.current).toMatchObject({ usuario: VEND, falhou: false });
  });
});
