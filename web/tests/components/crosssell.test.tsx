// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";

const criados: string[] = [];
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/crosssell",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("chart.js/auto", () => ({ default: class { constructor(c: HTMLCanvasElement) { criados.push(c.id); } destroy() {} } }));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { ContextoPainel } from "@/client/painel";
import Crosssell from "@/app/(dash)/crosssell/Crosssell";

const LINHAS = Array.from({ length: 6 }, (_, i) => linha({ docDigits: `1000000000${i}`, cli: i < 3 ? `Maria ${i}` : `Joao ${i}`, sit: "Ativa", ramo: "Automóvel", vig: "2020-01-01", com: 100 + i }));
const base = { linhas: LINHAS, sinistros: [], hoje: "2026-10-15", manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } } as unknown as BaseCliente;

afterEach(() => { cleanup(); criados.length = 0; });

describe("aba Cross-sell", () => {
  it("digitar na busca refaz só a tabela: o gráfico de nível não é recriado e KPIs/nível ficam com a lista de antes (onCrossSearch)", async () => {
    const { container } = render(
      <EstadoAbasProvider>
        <ContextoPainel.Provider value={{ base, recarregar: () => {}, abrirFontes: () => {} }}><Crosssell /></ContextoPainel.Provider>
      </EstadoAbasProvider>,
    );
    await waitFor(() => expect(criados.filter((id) => id === "ch-cross-nivel")).toHaveLength(1));
    const antesKpi = container.querySelector("#cross-kpi-grid")!.textContent;
    fireEvent.change(container.querySelector("#cross-search")!, { target: { value: "Mar" } });
    fireEvent.change(container.querySelector("#cross-search")!, { target: { value: "Maria" } });
    expect(container.querySelector("#cross-table-badge")!.textContent).toBe("3 clientes");
    expect(container.querySelector("#cross-kpi-grid")!.textContent).toBe(antesKpi);
    expect(container.querySelector("#cross-nivel-badge")!.textContent).toBe("6 clientes");
    await new Promise((r) => setTimeout(r, 50));
    expect(criados.filter((id) => id === "ch-cross-nivel")).toHaveLength(1);
  });
});
