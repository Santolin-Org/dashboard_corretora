// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/producao",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("chart.js/auto", () => ({ default: class { destroy() {} } }));
const baixar = vi.fn();
vi.mock("@/client/exportar", () => ({ baixarPlanilha: (...a: unknown[]) => baixar(...a) }));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { FiltrosProvider } from "@/client/filtros";
import { ContextoPainel } from "@/client/painel";
import { Cabecalho } from "@/components/Cabecalho";
import Producao from "@/app/(dash)/producao/Producao";

const LINHAS = [
  linha({ colab: "ANA", grp: "G1", premio: 300, com: 30, vig: "2026-02-01" }),
  linha({ colab: "BIA", grp: "G2", premio: 100, com: 20, vig: "2026-03-01" }),
];
const base = (linhas: typeof LINHAS) => ({ linhas, sinistros: [], hoje: "2026-10-15", manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } }) as unknown as BaseCliente;

function Raiz({ linhas = LINHAS }: { linhas?: typeof LINHAS }) {
  const [rota, setRota] = useState<"producao" | "outra">("producao");
  const b = base(linhas);
  return (
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{ base: b, recarregar: () => {}, abrirFontes: () => {} }}>
        <FiltrosProvider linhas={b.linhas}>
          <Cabecalho base={b} recBadge="" onAbrirFontes={() => {}} />
          <button type="button" onClick={() => setRota(rota === "producao" ? "outra" : "producao")}>trocar</button>
          {rota === "producao" ? <Producao /> : <p>outra aba</p>}
        </FiltrosProvider>
      </ContextoPainel.Provider>
    </EstadoAbasProvider>
  );
}

beforeEach(() => { baixar.mockReset(); window.history.replaceState(null, "", "/producao"); });
afterEach(() => cleanup());
const marcado = (c: HTMLElement, id: string) => (c.querySelector(`#${id}`) as HTMLInputElement).checked;

describe("aba Produção", () => {
  it("valores iniciais do main.js: colaborador, gráfico em prêmio, tabela em comissão, Prêmio líquido desc", () => {
    const { container } = render(<Raiz />);
    expect(marcado(container, "vt-colab")).toBe(true);
    expect(marcado(container, "mt-prod-p")).toBe(true);
    expect(marcado(container, "mt-tbl-c")).toBe(true);
    expect(container.querySelector("#prod-table-wrap th.sort-desc")!.textContent).toBe("Prêmio líquido");
    expect(container.querySelector("#prod-view-label")!.textContent).toBe("2 registros · Colaborador");
  });

  it("visão, métricas, ordenação e períodos sobrevivem à troca de aba", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#vt-grp")!);
    fireEvent.click(container.querySelector("#mt-prod-c")!);
    fireEvent.click(container.querySelector("#mt-tbl-p")!);
    fireEvent.click(container.querySelectorAll("#prod-table-wrap th")[1]); // Grupo de produção: nome, desc
    (container.querySelector("#period-start") as HTMLInputElement).value = "2026-01-01";
    (container.querySelector("#period-end") as HTMLInputElement).value = "2026-03-31";
    fireEvent.click(screen.getByText("+ Adicionar"));
    expect(container.querySelector("#period-tags")!.textContent).toBe("Jan/26 → Mar/26×");

    fireEvent.click(screen.getByText("trocar"));
    expect(screen.getByText("outra aba")).toBeTruthy();
    fireEvent.click(screen.getByText("trocar"));

    expect(marcado(container, "vt-grp")).toBe(true);
    expect(marcado(container, "mt-prod-c")).toBe(true);
    expect(marcado(container, "mt-tbl-p")).toBe(true);
    expect(container.querySelector("#prod-table-wrap th.sort-desc")!.textContent).toBe("Grupo de produção");
    expect(container.querySelector("#period-tags")!.textContent).toBe("Jan/26 → Mar/26×");
    expect(container.querySelector("#prod-view-label")!.textContent).toBe("2 registros · Grupo de produção");
  });

  it("períodos: validações com alert, remover e limpar", () => {
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { container } = render(<Raiz />);
    fireEvent.click(screen.getByText("+ Adicionar"));
    expect(alerta).toHaveBeenLastCalledWith("Selecione data de início e fim.");
    const ini = container.querySelector("#period-start") as HTMLInputElement, fim = container.querySelector("#period-end") as HTMLInputElement;
    ini.value = "2026-05-01"; fim.value = "2026-01-01";
    fireEvent.click(screen.getByText("+ Adicionar"));
    expect(alerta).toHaveBeenLastCalledWith("Início deve ser anterior ao fim.");
    ini.value = "2026-01-01"; fim.value = "2026-03-31";
    fireEvent.click(screen.getByText("+ Adicionar"));
    expect(ini.value).toBe(""); // addPeriod limpa os campos
    ini.value = "2025-01-01"; fim.value = "2025-03-31";
    fireEvent.click(screen.getByText("+ Adicionar"));
    expect(container.querySelectorAll("#period-tags .period-tag")).toHaveLength(2);
    fireEvent.click(container.querySelector("#period-tags .pt-remove")!);
    expect(container.querySelector("#period-tags")!.textContent).toBe("Jan/25 → Mar/25×");
    fireEvent.click(screen.getByText("Limpar períodos"));
    expect(container.querySelector("#period-tags")!.textContent).toBe("");
    alerta.mockRestore();
  });
});

describe("Exportar Resumo (cabeçalho)", () => {
  it("sem produção: alert e nada é gerado", () => {
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<Raiz linhas={[]} />);
    fireEvent.click(screen.getByText("Exportar Resumo"));
    expect(alerta).toHaveBeenCalledWith("Sem dados de produção para exportar.");
    expect(baixar).not.toHaveBeenCalled();
    alerta.mockRestore();
  });
  it("com produção: Resumo_Executivo.xlsx com as duas planilhas; usa a visão marcada na aba Produção", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#vt-grp")!);
    fireEvent.click(screen.getByText("Exportar Resumo"));
    expect(baixar).toHaveBeenCalledTimes(1);
    const [arquivo, abas] = baixar.mock.calls[0] as [string, { nome: string; linhas: Record<string, unknown>[] }[]];
    expect(arquivo).toBe("Resumo_Executivo.xlsx");
    expect(abas.map((a) => a.nome)).toEqual(["Base_Filtrada", "Producao_Por_Agente"]);
    expect(abas[0].linhas).toHaveLength(2);
    expect(abas[1].linhas.map((l) => l.Nome)).toEqual(["G1", "G2"]);
  });
});
