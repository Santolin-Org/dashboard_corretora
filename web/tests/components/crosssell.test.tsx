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

// Revalidação periódica com versão nova = recarga com keepFilters do app antigo (upload com o painel aberto):
// pessoa/ramo/colaborador/busca ficam; buildCrossFilters remarca os ramos principais se o ramo estiver vazio;
// renderCrossTable limita crossPage (e grava o valor limitado no global).
describe("aba Cross-sell: base nova (keepFilters)", () => {
  const clientes = (n: number, ramo = "Automóvel") => Array.from({ length: n }, (_, i) =>
    linha({ docDigits: String(20000000000 + i), cli: `Cliente ${i}`, sit: "Ativa", ramo, vig: "2020-01-01", com: 100 + i }));
  const comLinhas = (linhas: ReturnType<typeof linha>[]) => ({ ...base, linhas }) as BaseCliente;
  const arvore = (b: BaseCliente, montada = true) => (
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{ base: b, recarregar: () => {}, abrirFontes: () => {} }}>{montada ? <Crosssell /> : null}</ContextoPainel.Provider>
    </EstadoAbasProvider>
  );
  const pag = (c: HTMLElement) => c.querySelector("#cross-table-pagination")!.textContent ?? "";
  const linhasTabela = (c: HTMLElement) => c.querySelectorAll("#cross-table-wrap tbody tr").length;
  const gatilhoRam = (c: HTMLElement) => c.querySelector("#ms-cross-ram .ms-trigger-text")!.textContent;
  const proxima = (c: HTMLElement) => fireEvent.click([...c.querySelectorAll("#cross-table-pagination button")].find((b) => b.textContent!.includes("Próxima"))!);

  it("página além do fim com a base nova: limita à última página e a tabela não fica vazia", async () => {
    const { container, rerender } = render(arvore(comLinhas(clientes(130))));
    await waitFor(() => expect(pag(container)).toContain("Página 1 de 3"));
    proxima(container); proxima(container);
    expect(pag(container)).toContain("Página 3 de 3");
    rerender(arvore(comLinhas(clientes(60))));
    await waitFor(() => expect(pag(container)).toContain("Página 2 de 2"));
    expect(linhasTabela(container)).toBe(10);
    // a página limitada fica gravada (como crossPage no antigo): voltar a ter 3 páginas não salta para a 3
    rerender(arvore(comLinhas(clientes(130))));
    await waitFor(() => expect(pag(container)).toContain("Página 2 de 3"));
  });

  it("ramo vazio (depois de ↻ Limpar) é remarcado com os ramos principais da base nova; busca e pessoa ficam", async () => {
    const { container, rerender } = render(arvore(comLinhas(clientes(5))));
    await waitFor(() => expect(gatilhoRam(container)).toBe("Automóvel"));
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "↻ Limpar")!);
    expect(gatilhoRam(container)).toBe("Todos");
    fireEvent.change(container.querySelector("#cross-search")!, { target: { value: "Cliente 1" } });
    rerender(arvore(comLinhas(clientes(6))));
    await waitFor(() => expect(gatilhoRam(container)).toBe("Automóvel"));
    expect((container.querySelector("#cross-search") as HTMLInputElement).value).toBe("Cliente 1");
    expect(container.querySelector("#cross-table-badge")!.textContent).toBe("1 clientes");
  });

  it("ramo marcado pelo usuário fica como está na base nova", async () => {
    const dois = [...clientes(3), ...clientes(3, "Residencial").map((l, i) => ({ ...l, docDigits: String(30000000000 + i) }))];
    const { container, rerender } = render(arvore(comLinhas(dois)));
    await waitFor(() => expect(gatilhoRam(container)).toBe("Automóvel"));
    rerender(arvore(comLinhas([...dois, ...clientes(1)])));
    await new Promise((r) => setTimeout(r, 20));
    expect(gatilhoRam(container)).toBe("Automóvel");
  });

  it("base trocou com a aba desmontada: ao voltar, o ramo vazio é remarcado", async () => {
    const { container, rerender } = render(arvore(comLinhas(clientes(5))));
    await waitFor(() => expect(gatilhoRam(container)).toBe("Automóvel"));
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "↻ Limpar")!);
    expect(gatilhoRam(container)).toBe("Todos");
    const nova = comLinhas(clientes(7));
    rerender(arvore(nova, false));
    rerender(arvore(nova, true));
    await waitFor(() => expect(gatilhoRam(container)).toBe("Automóvel"));
  });
});
