// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import { ContextoPainel } from "@/client/painel";
import { UsuariosVinculos } from "@/components/admin/UsuariosVinculos";

const mockUsuario = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/client/usuario", () => ({ useUsuario: () => ({ usuario: { email: "a@x", nome: "A", role: mockUsuario.role, nomes: [] }, carregando: false }) }));
import PaginaUsuarios from "@/app/(dash)/admin/usuarios/PaginaUsuarios";

const GV = "GABRIEL VERAS - SANTOLIN", SD = "ALESSANDRA (OFICIAL) - SANTOLIN", SD2 = "DÊNISE CHRISTO - SANTOLIN", IG = "TRANSFERENCIA CORRETAGEM - SANTOLIN";
const LINHAS = [
  linha({ colab: GV }), linha({ colab: SD }), linha({ colab: SD }), linha({ colab: SD2 }), linha({ colab: IG }),
];
const fakeBase = () => ({ linhas: LINHAS, sinistros: [], hoje: "2026-10-22", manifesto: [], avisosSaude: [] }) as unknown as BaseCliente;
const Raiz = ({ children }: { children: React.ReactNode }) =>
  <ContextoPainel.Provider value={{ base: fakeBase(), recarregar: () => {}, abrirFontes: () => {} }}>{children}</ContextoPainel.Provider>;

type Dados = { usuarios: { id: number; email: string; nome: string; role: string; ativo: boolean; nomes: string[] }[]; ignorados: string[] };
let dados: Dados;
const inicial = (): Dados => ({
  usuarios: [
    { id: 1, email: "gabriel@s.com", nome: "Gabriel Veras", role: "vendedor", ativo: true, nomes: [GV] },
    { id: 2, email: "gustavo@s.com", nome: "Gustavo Vieira", role: "vendedor", ativo: true, nomes: [] },
    { id: 3, email: "celso@s.com", nome: "Celso Santolin", role: "gestao", ativo: false, nomes: [] },
  ],
  ignorados: [IG],
});
let escritas: { url: string; metodo: string; corpo: unknown }[];
let respostaEscrita: { status: number; corpo: unknown } | null;
const ok = (corpo: unknown, status = 200) => ({ ok: status < 400, status, json: async () => corpo }) as Response;

beforeEach(() => {
  dados = inicial(); escritas = []; respostaEscrita = null; mockUsuario.role = "admin";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || !init.method || init.method === "GET") return ok(dados);
    escritas.push({ url, metodo: init.method, corpo: JSON.parse(String(init.body)) });
    if (respostaEscrita) return ok(respostaEscrita.corpo, respostaEscrita.status);
    return ok({ ok: true, id: 9 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const abrir = async () => { render(<Raiz><UsuariosVinculos /></Raiz>); await screen.findByText("Gabriel Veras"); };
const linhaDe = (nome: string) => screen.getByText(nome).closest("tr")!;

describe("Usuários e vínculos", () => {
  it("lista etiquetas, selo de papel, aviso de sem vínculo (só vendedor) e inativo", async () => {
    await abrir();
    const g = linhaDe("Gabriel Veras");
    expect(within(g).getByText(GV)).toBeTruthy();
    expect(within(g).getByText("vendedor")).toBeTruthy();
    expect(within(linhaDe("Gustavo Vieira")).getByText("⚠ sem vínculo — vê o painel vazio")).toBeTruthy();
    const c = linhaDe("Celso Santolin");
    expect(within(c).getByText("gestão")).toBeTruthy();
    expect(within(c).getByText("inativo")).toBeTruthy();
    expect(within(c).queryByText(/sem vínculo/)).toBeNull();
  });

  it("coluna 'Nomes sem dono' conta apólices, exclui vinculados e ignorados", async () => {
    await abrir();
    expect(screen.getByText("Nomes sem dono · 2")).toBeTruthy();
    const col = screen.getByText("Nomes sem dono · 2").closest("section")!;
    expect(within(col).getByText(SD).parentElement!.textContent).toContain("2");
    expect(within(col).queryByText(GV)).toBeNull();
    expect(within(col).getAllByText(IG)).toHaveLength(1); // só na lista recolhida de "não é pessoa"
    expect(within(col).getByText(IG).closest("details")).toBeTruthy();
  });

  it("'+ nome' busca sem acento/caixa e envia PUT vinculos com o id", async () => {
    await abrir();
    fireEvent.click(within(linhaDe("Gustavo Vieira")).getByRole("button", { name: "+ nome" }));
    fireEvent.change(screen.getByLabelText("Buscar nome"), { target: { value: "denise" } });
    const menu = within(screen.getByLabelText("Buscar nome").parentElement!);
    expect(menu.queryByRole("button", { name: SD })).toBeNull();
    dados = { ...dados, usuarios: dados.usuarios.map((u) => (u.id === 2 ? { ...u, nomes: [SD2] } : u)) };
    fireEvent.click(menu.getByRole("button", { name: SD2 }));
    await waitFor(() => expect(escritas).toEqual([{ url: "/api/admin/vinculos", metodo: "PUT", corpo: { nome: SD2, userId: 2 } }]));
    await waitFor(() => expect(within(linhaDe("Gustavo Vieira")).getByText(SD2)).toBeTruthy());
    expect(screen.getByText("Nomes sem dono · 1")).toBeTruthy();
  });

  it("clicar num nome sem dono abre os logins ativos e vincula", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: SD }));
    expect(screen.queryByRole("button", { name: "Celso Santolin" })).toBeNull(); // inativo
    fireEvent.click(screen.getByRole("button", { name: "Gabriel Veras" }));
    await waitFor(() => expect(escritas[0]).toEqual({ url: "/api/admin/vinculos", metodo: "PUT", corpo: { nome: SD, userId: 1 } }));
  });

  it("remover etiqueta pede confirmação e envia userId null", async () => {
    await abrir();
    const conf = vi.fn(() => false); vi.stubGlobal("confirm", conf);
    fireEvent.click(screen.getByRole("button", { name: `Desvincular ${GV}` }));
    expect(conf).toHaveBeenCalledWith(`Desvincular ${GV}?`);
    expect(escritas).toHaveLength(0);
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(screen.getByRole("button", { name: `Desvincular ${GV}` }));
    await waitFor(() => expect(escritas[0].corpo).toEqual({ nome: GV, userId: null }));
  });

  it("erro 400 do vínculo aparece na tela", async () => {
    await abrir();
    respostaEscrita = { status: 400, corpo: { erro: "Nome já vinculado a outro login" } };
    fireEvent.click(screen.getByRole("button", { name: SD }));
    fireEvent.click(screen.getByRole("button", { name: "Gabriel Veras" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nome já vinculado a outro login");
  });

  it("'não é pessoa' tira da coluna após recarregar; 'desfazer' devolve", async () => {
    await abrir();
    dados = { ...dados, ignorados: [IG, SD] };
    fireEvent.click(screen.getByRole("button", { name: `Não é pessoa: ${SD}` }));
    await waitFor(() => expect(escritas[0]).toEqual({ url: "/api/admin/ignorados", metodo: "PUT", corpo: { nome: SD, ignorar: true } }));
    await waitFor(() => expect(screen.getByText("Nomes sem dono · 1")).toBeTruthy());
    expect(screen.getByText("Marcados como não é pessoa · 2")).toBeTruthy();
    dados = { ...dados, ignorados: [IG] };
    fireEvent.click(screen.getByRole("button", { name: `Desfazer: ${SD}` }));
    await waitFor(() => expect(escritas[1].corpo).toEqual({ nome: SD, ignorar: false }));
    await waitFor(() => expect(screen.getByText("Nomes sem dono · 2")).toBeTruthy());
  });

  it("novo usuário: POST sem id; erro 400 fica no formulário aberto", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "+ Novo usuário" }));
    const f = screen.getByRole("form", { name: "Usuário" });
    fireEvent.change(within(f).getByLabelText("E-mail"), { target: { value: "novo@s.com" } });
    fireEvent.change(within(f).getByLabelText("Nome"), { target: { value: "Novo" } });
    fireEvent.change(within(f).getByLabelText("Papel"), { target: { value: "gestao" } });
    respostaEscrita = { status: 400, corpo: { erro: "E-mail inválido" } };
    fireEvent.click(within(f).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(within(f).getByRole("alert").textContent).toBe("E-mail inválido"));
    expect(escritas[0]).toEqual({ url: "/api/admin/usuarios", metodo: "POST", corpo: { email: "novo@s.com", nome: "Novo", role: "gestao", ativo: true } });
    respostaEscrita = null;
    fireEvent.click(within(f).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Usuário" })).toBeNull());
  });

  it("editar preenche o formulário e envia o id", async () => {
    await abrir();
    fireEvent.click(within(linhaDe("Celso Santolin")).getByRole("button", { name: "Editar" }));
    const f = screen.getByRole("form", { name: "Usuário" });
    expect((within(f).getByLabelText("E-mail") as HTMLInputElement).value).toBe("celso@s.com");
    expect((within(f).getByLabelText("Papel") as HTMLSelectElement).value).toBe("gestao");
    fireEvent.click(within(f).getByLabelText("Ativo"));
    fireEvent.click(within(f).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(escritas[0].corpo).toEqual({ id: 3, email: "celso@s.com", nome: "Celso Santolin", role: "gestao", ativo: true }));
  });
});

describe("Página", () => {
  it("não-admin não renderiza nada", () => {
    mockUsuario.role = "vendedor";
    const { container } = render(<Raiz><PaginaUsuarios /></Raiz>);
    expect(container.innerHTML).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
});
