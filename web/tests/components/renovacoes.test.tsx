// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { Linha } from "@/domain/tipos";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/renovacoes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { FiltrosProvider } from "@/client/filtros";
import { ContextoPainel } from "@/client/painel";
import { ABAS, ABAS_PRODUCAO } from "@/components/Abas";
import Renovacoes from "@/app/(dash)/renovacoes/Renovacoes";

// hoje = 09/11/2026, sem vigência global: o período é novembro/2026 inteiro. Números fictícios.
const L: Linha[] = [
  linha({ cli: "José Renovou", docDigits: "111", ramo: "Auto", tipo: "N", sit: "Renovada", vig: "2025-11-05", fim: "2026-11-05", premio: 1000, com: 100, apolice: "A1" }),
  linha({ cli: "José Renovou", docDigits: "111", ramo: "Auto", tipo: "R", sit: "Ativa", vig: "2026-11-05", fim: "2027-11-05", premio: 1200, com: 130, apolice: "A1-NOVA" }),
  linha({ cli: "Maria Venceu", docDigits: "222", ramo: "Residencial", tipo: "R", sit: "Vencida", vig: "2025-11-07", fim: "2026-11-07", premio: 500, com: 50, apolice: "B1" }),
  linha({ cli: "Pedro Aberto", docDigits: "333", ramo: "Vida", tipo: "N", sit: "Ativa", vig: "2025-11-25", fim: "2026-11-25", premio: 300, com: 30, apolice: "C1" }),
  linha({ cli: "Ana Cancelou", docDigits: "444", ramo: "Auto", tipo: "N", sit: "Cancelada", vig: "2025-11-20", fim: "2026-11-20", premio: 900, com: 90, apolice: "D1" }),
];
const base = (linhas: Linha[]) => ({ linhas, sinistros: [], hoje: "2026-11-09", manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } }) as unknown as BaseCliente;

function montar(linhas = L) {
  const b = base(linhas);
  return render(
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{ base: b, recarregar: () => {}, abrirFontes: () => {} }}>
        <FiltrosProvider linhas={b.linhas}><Renovacoes /></FiltrosProvider>
      </ContextoPainel.Provider>
    </EstadoAbasProvider>,
  );
}
afterEach(() => cleanup());

describe("aba Renovações", () => {
  it("está no menu e é uma aba de produção", () => {
    expect(ABAS.some((a) => a.id === "renovacoes" && a.rotulo === "Renovações")).toBe(true);
    expect(ABAS_PRODUCAO).toContain("renovacoes");
  });

  it("cards: renovações × o que chegou para renovar, sem a cancelada", () => {
    const { container } = montar();
    const kpis = container.querySelector("#renov-kpis")!;
    const texto = kpis.textContent!.replace(/ /g, " ");
    expect(texto).toContain("R$ 1.200,00 de R$ 1.800,00"); // prêmio
    expect(texto).toContain("R$ 130,00 de R$ 180,00"); // comissão
    expect(texto).toContain("1 de 3");
    expect(texto).toContain("1 renovadas · 1 vencidas · 1 em aberto");
    expect(container.querySelector("#renov-periodo")!.textContent).toContain("01/11/2026 a 30/11/2026");
  });

  it("lista apólice por apólice com a renovação ligada e a situação", () => {
    montar();
    const tabela = screen.getByRole("table");
    const linhas = within(tabela).getAllByRole("row").slice(1).map((r) => r.textContent!.replace(/ /g, " "));
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("José Renovou");
    expect(linhas[0]).toContain("R$ 1.000,00");
    expect(linhas[0]).toContain("R$ 1.200,00");
    expect(linhas[0]).toContain("Renovada");
    expect(linhas[1]).toMatch(/Maria Venceu.*—.*Vencida/);
    expect(linhas[2]).toMatch(/Pedro Aberto.*Em aberto/);
    expect(tabela.textContent).not.toContain("Ana Cancelou");
  });

  it("a busca filtra a lista sem mexer nos cards", () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "maria" } });
    const linhas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toContain("Maria Venceu");
    expect(container.querySelector("#renov-badge")!.textContent).toBe("1 apólices");
    expect(container.querySelector("#renov-kpis")!.textContent!.replace(/ /g, " ")).toContain("1 de 3");
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "ninguém" } });
    expect(screen.getByText("Nenhuma apólice encontrada para essa busca.")).toBeTruthy();
  });

  it("pagina de 50 em 50 e a busca volta para a página 1", () => {
    const muitas = Array.from({ length: 60 }, (_, i) => linha({ cli: `Cli ${String(i).padStart(2, "0")}`, docDigits: `9${i}`, tipo: "N", sit: "Vencida", fim: "2026-11-10", apolice: `M${i}` }));
    montar(muitas);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(51);
    fireEvent.click(screen.getByText("Próxima →"));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(11);
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "cli" } });
    expect(screen.getByText("Página 1 de 2")).toBeTruthy();
  });
});
