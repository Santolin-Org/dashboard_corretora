// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuExibicaoTv } from "@/components/MenuExibicaoTv";
import { usePainelTv } from "@/client/painelTv";

describe("menu da Exibição TV (escolha do painel antes de abrir)", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, "", "/metas?f=x"); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("o botão abre a lista de painéis; escolher salva o painel e abre a exibição", () => {
    const ir = vi.fn();
    const { container } = render(<MenuExibicaoTv temDados ir={ir} />);
    const botao = container.querySelector<HTMLButtonElement>("#tv-ex-abrir")!;
    expect(botao.textContent).toBe("📺 Exibição TV");
    expect(container.querySelector("#tv-painel-menu")).toBeNull();
    act(() => botao.click());
    const itens = [...container.querySelectorAll<HTMLButtonElement>("#tv-painel-menu [data-painel]")];
    expect(itens.map((b) => b.dataset.painel)).toEqual(["360_tri3", "360_tri4"]);
    // o salvo (padrão) vem marcado
    expect(itens[1].getAttribute("aria-current")).toBe("true");
    act(() => itens[0].click());
    expect(localStorage.getItem("tvPainel")).toBe("360_tri3");
    expect(ir).toHaveBeenCalledWith("/exibicao-tv?f=x");
    expect(sessionStorage.getItem("tvVoltarPara")).toBe("/metas");
    expect(container.querySelector("#tv-painel-menu")).toBeNull();
  });

  it("Esc fecha a lista sem abrir", () => {
    const ir = vi.fn();
    const { container } = render(<MenuExibicaoTv temDados ir={ir} />);
    act(() => container.querySelector<HTMLButtonElement>("#tv-ex-abrir")!.click());
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(container.querySelector("#tv-painel-menu")).toBeNull();
    expect(ir).not.toHaveBeenCalled();
  });

  it("sem dados avisa e não abre a lista (openTvExibicao do antigo)", () => {
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { container } = render(<MenuExibicaoTv temDados={false} ir={vi.fn()} />);
    act(() => container.querySelector<HTMLButtonElement>("#tv-ex-abrir")!.click());
    expect(alerta).toHaveBeenCalledWith("Carregue os dados antes de abrir a exibição.");
    expect(container.querySelector("#tv-painel-menu")).toBeNull();
    alerta.mockRestore();
  });
});

function Sonda() { return <span id="sonda">{usePainelTv().id}</span>; }
const sonda = () => document.getElementById("sonda")!.textContent;

describe("painel salvo no aparelho (usePainelTv)", () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/exibicao-tv"); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("padrão é 360_tri4", () => { render(<Sonda />); expect(sonda()).toBe("360_tri4"); });
  it("?painel= na URL abre naquele painel e fica salvo", () => {
    window.history.replaceState(null, "", "/exibicao-tv?painel=360_tri3");
    render(<Sonda />);
    expect(sonda()).toBe("360_tri3");
    expect(localStorage.getItem("tvPainel")).toBe("360_tri3");
  });
  it("valor salvo inválido cai no padrão", () => {
    localStorage.setItem("tvPainel", "nao-existe");
    render(<Sonda />);
    expect(sonda()).toBe("360_tri4");
  });
});
