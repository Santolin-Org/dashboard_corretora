// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SELETOR_TV_OCULTA_MS, SeletorPainelTv } from "@/components/SeletorPainelTv";
import { usePainelTv } from "@/client/painelTv";

function Sonda() { return <span id="sonda">{usePainelTv().id}</span>; }
const sonda = () => document.getElementById("sonda")!.textContent;

describe("seletor de painel da Exibição TV", () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/exibicao-tv"); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("padrão é 360_tri4; escolher outro salva no aparelho e atualiza a tela", () => {
    const { container } = render(<><SeletorPainelTv /><Sonda /></>);
    const sel = container.querySelector<HTMLSelectElement>("#tv-painel")!;
    expect(sel.value).toBe("360_tri4");
    expect(sonda()).toBe("360_tri4");
    expect([...sel.options].map((o) => o.value)).toEqual(["360_tri3", "360_tri4"]);
    act(() => { sel.value = "360_tri3"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(localStorage.getItem("tvPainel")).toBe("360_tri3");
    expect(sonda()).toBe("360_tri3");
  });

  it("?painel= na URL abre naquele painel e fica salvo; id desconhecido é ignorado", () => {
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

  it("fica invisível até mexer o mouse e some sozinho depois de 3 s", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<SeletorPainelTv />);
      const rotulo = () => container.querySelector("label")!.getAttribute("data-visivel");
      expect(rotulo()).toBe("false");
      act(() => { window.dispatchEvent(new MouseEvent("mousemove")); });
      expect(rotulo()).toBe("true");
      act(() => { vi.advanceTimersByTime(SELETOR_TV_OCULTA_MS + 10); });
      expect(rotulo()).toBe("false");
    } finally { vi.useRealTimers(); }
  });
});
