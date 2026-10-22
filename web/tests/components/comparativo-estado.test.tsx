// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/comparativo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { ContextoPainel } from "@/client/painel";
import { FiltrosProvider } from "@/client/filtros";
import { useEstadoComp } from "@/app/(dash)/comparativo/estado";
import { periodoPadraoComp } from "@/domain/comparativo";

afterEach(() => cleanup());

const baseCom = (n: number) => ({
  linhas: Array.from({ length: n }, (_, i) => linha({ docDigits: String(i), vig: "2026-02-01" })), sinistros: [], hoje: "2026-10-15",
  manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 },
}) as unknown as BaseCliente;

describe("useEstadoComp: base nova", () => {
  it("com período manual ativo, a base nova regrava o período padrão (initDashboard) e mantém o manual", async () => {
    let base = baseCom(2);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EstadoAbasProvider>
        <ContextoPainel.Provider value={{ base, recarregar: () => {}, abrirFontes: () => {} }}>
          <FiltrosProvider linhas={base.linhas}>{children}</FiltrosProvider>
        </ContextoPainel.Provider>
      </EstadoAbasProvider>
    );
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, rerender } = renderHook(() => useEstadoComp(), { wrapper });
    await act(async () => {});
    act(() => result.current.setManual({ start: "2025-03-01", end: "2025-06-30" }));
    expect(result.current.manual).toEqual({ start: "2025-03-01", end: "2025-06-30" });
    base = baseCom(3);
    rerender();
    await act(async () => {});
    expect(result.current.manual).toEqual(periodoPadraoComp("2026-10-15"));
    rerender();
    await act(async () => {});
    expect(result.current.manual).toEqual(periodoPadraoComp("2026-10-15")); // estável depois da troca
    expect(erros).not.toHaveBeenCalled(); // sem "Cannot update a component while rendering"
    erros.mockRestore();
  });
});
