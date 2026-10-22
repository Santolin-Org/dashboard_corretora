// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/retencao",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("chart.js/auto", () => ({ default: class { destroy() {} } }));
const baixar = vi.fn();
vi.mock("@/client/exportar", () => ({ baixarPlanilha: (...a: unknown[]) => baixar(...a) }));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { FiltrosProvider } from "@/client/filtros";
import { ContextoPainel } from "@/client/painel";
import { FiltrosGlobais } from "@/components/FiltrosGlobais";
import Retencao from "@/app/(dash)/retencao/Retencao";

// Perdidas no período padrão (2026-01-01 a 2026-10-15): vencidas de CAROL e cancelada de ANA.
const PERDIDAS = [
  linha({ colab: "ANA", grp: "G1", sit: "Cancelada", motivo: "Preço", cancel: "2026-03-10", vig: "2026-01-10", fim: "2027-01-10", premio: 500, com: 50, apolice: "A1", tipo: "N" }),
  linha({ colab: "BIA", grp: "G2", sit: "Vencida", vig: "2025-04-01", fim: "2026-04-01", premio: 300, com: 30, apolice: "A2", tipo: "R" }),
  linha({ colab: "BIA", grp: "G2", sit: "Ativa", vig: "2026-02-01", fim: "2027-02-01", premio: 100, com: 10, apolice: "A3", tipo: "N" }),
];
const MUITAS = Array.from({ length: 60 }, (_, i) => linha({ colab: "CAROL", grp: "G1", sit: "Vencida", vig: "2025-05-01", fim: "2026-05-01", premio: 1000 - i, com: 10, apolice: "V" + i, tipo: "R" }));
const base = (linhas: typeof PERDIDAS) => ({ linhas, sinistros: [], hoje: "2026-10-15", manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } }) as unknown as BaseCliente;

function Raiz({ linhas = PERDIDAS }: { linhas?: typeof PERDIDAS }) {
  const [rota, setRota] = useState<"retencao" | "outra">("retencao");
  const b = base(linhas);
  return (
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{ base: b, recarregar: () => {}, abrirFontes: () => {} }}>
        <FiltrosProvider linhas={b.linhas}>
          <FiltrosGlobais temProducao />
          <button type="button" onClick={() => setRota(rota === "retencao" ? "outra" : "retencao")}>trocar</button>
          {rota === "retencao" ? <Retencao /> : <p>outra aba</p>}
        </FiltrosProvider>
      </ContextoPainel.Provider>
    </EstadoAbasProvider>
  );
}

beforeEach(() => { baixar.mockReset(); window.history.replaceState(null, "", "/retencao"); });
afterEach(() => cleanup());
const ativo = (c: HTMLElement, id: string) => c.querySelector(`#${id}`)!.classList.contains("active");
const txt = (c: HTMLElement, id: string) => c.querySelector(`#${id}`)!.textContent;

describe("aba Retenção", () => {
  it("valores iniciais do main.js: período 1º/jan–hoje, só evitável ligado, visão Colaborador, ordem % Churn itens desc, filtro Todas", () => {
    const { container } = render(<Raiz />);
    expect((container.querySelector("#ret-per-s") as HTMLInputElement).value).toBe("2026-01-01");
    expect((container.querySelector("#ret-per-e") as HTMLInputElement).value).toBe("2026-10-15");
    expect(ativo(container, "ret-evitavel-btn")).toBe(true);
    expect(ativo(container, "ret-tipo-R")).toBe(false);
    expect((container.querySelector("#vt-ret-colab") as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector("#ret-prod-table-wrap th.sort-desc")!.textContent!.trim()).toBe("% Churn itens");
    expect((container.querySelector("#ret-filter-all-btn") as HTMLElement).style.fontWeight).toBe("600");
    expect(txt(container, "ret-kpi-badge")).toBe("01/01/2026 a 15/10/2026 · só evitável");
    expect(txt(container, "ret-detail-badge")).toBe("2 perdidas");
  });

  it("filtros próprios são independentes dos globais: um filtro global não muda a aba", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#ms-col input[data-valor='ANA']")!);
    expect(txt(container, "ret-detail-badge")).toBe("2 perdidas");
    fireEvent.click(container.querySelector("#ms-ret-col input[data-valor='ANA']")!);
    expect(txt(container, "ret-detail-badge")).toBe("1 perdidas");
  });

  it("estado (filtros, período, visão, ordenação, situação do detalhe) sobrevive à troca de aba", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!);
    fireEvent.click(container.querySelector("#ret-tipo-R")!);
    fireEvent.click(container.querySelector("#vt-ret-grp")!);
    fireEvent.click(container.querySelectorAll("#ret-prod-table-wrap th")[0]); // Grupo, desc
    fireEvent.click(container.querySelector("#ret-filter-venc-btn")!);
    fireEvent.change(container.querySelector("#ret-per-s")!, { target: { value: "2025-01-01" } });

    fireEvent.click(screen.getByText("trocar"));
    expect(screen.getByText("outra aba")).toBeTruthy();
    fireEvent.click(screen.getByText("trocar"));

    expect(ativo(container, "ret-evitavel-btn")).toBe(false);
    expect(ativo(container, "ret-tipo-R")).toBe(true);
    expect((container.querySelector("#vt-ret-grp") as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector("#ret-prod-table-wrap th.sort-desc")!.textContent!.trim()).toBe("Grupo");
    expect((container.querySelector("#ret-filter-venc-btn") as HTMLElement).style.fontWeight).toBe("600");
    expect((container.querySelector("#ret-filter-all-btn") as HTMLElement).style.fontWeight).toBe("");
    expect((container.querySelector("#ret-per-s") as HTMLInputElement).value).toBe("2025-01-01");
    expect(txt(container, "ret-kpi-badge")).toBe("01/01/2025 a 15/10/2026");
  });

  it("Limpar da aba volta período, filtros, tipos e só evitável, mas não a ordenação nem o filtro do detalhe", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!);
    fireEvent.click(container.querySelector("#ret-tipo-N")!);
    fireEvent.click(container.querySelector("#ms-ret-col input[data-valor='ANA']")!);
    fireEvent.change(container.querySelector("#ret-per-e")!, { target: { value: "2026-06-30" } });
    fireEvent.click(container.querySelector("#ret-filter-canc-btn")!);
    fireEvent.click(container.querySelectorAll("#ret-prod-table-wrap th")[0]);
    fireEvent.click(screen.getByText("↻ Limpar"));
    expect((container.querySelector("#ret-per-e") as HTMLInputElement).value).toBe("2026-10-15");
    expect(ativo(container, "ret-evitavel-btn")).toBe(true);
    expect(ativo(container, "ret-tipo-N")).toBe(false);
    expect(container.querySelector("#ms-ret-col .ms-trigger-text")!.textContent).toBe("Todos");
    expect(container.querySelector("#ret-prod-table-wrap th.sort-desc")!.textContent!.trim()).toBe("Colaborador");
    expect((container.querySelector("#ret-filter-canc-btn") as HTMLElement).style.fontWeight).toBe("600");
  });

  it("quirk do antigo: o Limpar filtros GLOBAL tira o destaque dos botões R/N/Só evitável sem mudar o filtro", () => {
    const { container } = render(<Raiz />);
    fireEvent.click(container.querySelector("#ret-tipo-R")!);
    expect(ativo(container, "ret-tipo-R")).toBe(true);
    fireEvent.click(screen.getByText("↻ Limpar filtros"));
    expect(ativo(container, "ret-tipo-R")).toBe(false);
    expect(ativo(container, "ret-evitavel-btn")).toBe(false);
    expect(txt(container, "ret-kpi-badge")).toBe("01/01/2026 a 15/10/2026 · só evitável"); // filtro intacto
    expect(txt(container, "ret-detail-badge")).toBe("1 perdidas"); // só a Renovação (R) segue valendo
    // Reclicar R: o estado tem R, então o clique o remove (e o destaque continua apagado).
    fireEvent.click(container.querySelector("#ret-tipo-R")!);
    expect(ativo(container, "ret-tipo-R")).toBe(false);
    expect(txt(container, "ret-detail-badge")).toBe("2 perdidas");
    // Só evitável volta a refletir o estado ao clicar.
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!);
    expect(ativo(container, "ret-evitavel-btn")).toBe(false);
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!);
    expect(ativo(container, "ret-evitavel-btn")).toBe(true);
  });

  it("selos usam o plural quebrado do antigo (colaboradors / grupos)", () => {
    const { container } = render(<Raiz />);
    expect(txt(container, "ret-prod-badge")).toBe("2 colaboradors");
    fireEvent.click(container.querySelector("#vt-ret-grp")!);
    expect(txt(container, "ret-prod-badge")).toBe("2 grupos");
  });

  it("detalhe: 50 por página, paginação, volta à página 1 ao mudar filtro e some quando cabe numa página", () => {
    const { container } = render(<Raiz linhas={MUITAS} />);
    const pag = container.querySelector("#ret-detail-pagination") as HTMLElement;
    expect(pag.style.display).toBe("flex");
    expect(container.querySelectorAll("#ret-detail-wrap tbody tr")).toHaveLength(50);
    expect(pag.textContent).toBe("1–50 de 60 ← Anterior Página 1 de 2 Próxima →");
    expect((screen.getByText("← Anterior") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Próxima →"));
    expect(container.querySelectorAll("#ret-detail-wrap tbody tr")).toHaveLength(10);
    expect(pag.textContent).toBe("51–60 de 60 ← Anterior Página 2 de 2 Próxima →");
    fireEvent.click(container.querySelector("#ret-filter-all-btn")!); // retDetailPage = 1
    expect(pag.textContent).toContain("Página 1 de 2");
    fireEvent.click(screen.getByText("Próxima →"));
    fireEvent.click(container.querySelector("#vt-ret-grp")!); // renderRetTab: volta à página 1
    expect(pag.textContent).toContain("Página 1 de 2");
    fireEvent.click(container.querySelector("#ret-filter-canc-btn")!);
    expect(container.querySelector("#ret-detail-wrap")!.textContent).toBe("Nenhuma apólice perdida no período com os filtros atuais.");
    expect(pag.style.display).toBe("none");
  });

  it("página do detalhe volta a 1 a cada ação, mesmo desligando e religando o filtro ou Limpar nos padrões", () => {
    const { container } = render(<Raiz linhas={MUITAS} />);
    const pag = container.querySelector("#ret-detail-pagination") as HTMLElement;
    fireEvent.click(screen.getByText("Próxima →"));
    expect(pag.textContent).toContain("Página 2 de 2");
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!);
    fireEvent.click(container.querySelector("#ret-evitavel-btn")!); // de volta ao mesmo estado
    expect(pag.textContent).toContain("Página 1 de 2");
    fireEvent.click(screen.getByText("Próxima →"));
    fireEvent.click(screen.getByText("↻ Limpar")); // já nos padrões
    expect(pag.textContent).toContain("Página 1 de 2");
  });

  it("página do detalhe volta a 1 com filtro global, Limpar filtros global e troca da base", () => {
    const { container, rerender } = render(<Raiz linhas={MUITAS} />);
    const pag = container.querySelector("#ret-detail-pagination") as HTMLElement;
    const pagina2 = () => { fireEvent.click(screen.getByText("Próxima →")); expect(pag.textContent).toContain("Página 2 de 2"); };
    pagina2();
    fireEvent.click(container.querySelector("#ms-col input[data-valor='CAROL']")!);
    expect(pag.textContent).toContain("Página 1 de 2");
    pagina2();
    fireEvent.click(screen.getByText("↻ Limpar filtros"));
    expect(pag.textContent).toContain("Página 1 de 2");
    pagina2();
    rerender(<Raiz linhas={[...MUITAS]} />);
    expect(pag.textContent).toContain("Página 1 de 2");
  });

  it("página do detalhe NÃO volta a 1 em re-render sem mudança (ordenar a tabela por produtor)", () => {
    const { container } = render(<Raiz linhas={MUITAS} />);
    const pag = container.querySelector("#ret-detail-pagination") as HTMLElement;
    fireEvent.click(screen.getByText("Próxima →"));
    fireEvent.click(container.querySelectorAll("#ret-prod-table-wrap th")[1]);
    expect(pag.textContent).toContain("Página 2 de 2");
  });

  it("colaborador: opções remontadas com os marcados atuais quando os dados são recarregados", () => {
    const L1 = [linha({ colab: "ANA", vig: "2026-02-01" }), linha({ colab: "BIA", vig: "2026-02-01" })];
    const L2 = [linha({ colab: "BIA", vig: "2026-02-01" })];
    const Raiz2 = ({ ls }: { ls: typeof L1 }) => {
      const b = base(ls);
      return (
        <EstadoAbasProvider>
          <ContextoPainel.Provider value={{ base: b, recarregar: () => {}, abrirFontes: () => {} }}>
            <FiltrosProvider linhas={b.linhas}><Retencao /></FiltrosProvider>
          </ContextoPainel.Provider>
        </EstadoAbasProvider>
      );
    };
    const { container, rerender } = render(<Raiz2 ls={L1} />);
    fireEvent.click(container.querySelector("#ms-ret-col input[data-valor='ANA']")!);
    rerender(<Raiz2 ls={L2} />);
    const vals = [...container.querySelectorAll("#ms-ret-col input[type=checkbox]")].map((c) => c.getAttribute("data-valor"));
    expect(vals).toEqual(["ANA", "BIA"]); // ANA segue marcada, mesmo sem produção na nova base
  });

  it("Exportar: churn usa a visão marcada; detalhe exporta TODAS as perdidas no filtro de situação (sem paginar)", () => {
    const { container } = render(<Raiz linhas={MUITAS} />);
    fireEvent.click(container.querySelector("#vt-ret-grp")!);
    fireEvent.click(screen.getAllByText("Exportar")[0]);
    const [arq1, abas1] = baixar.mock.calls[0] as [string, { nome: string; linhas: Record<string, unknown>[] }[]];
    expect(arq1).toBe("Export_Churn.xlsx");
    expect(abas1.map((a) => a.nome)).toEqual(["Churn"]);
    expect(abas1[0].linhas.map((l) => l.Nome)).toEqual(["G1"]);
    fireEvent.click(screen.getAllByText("Exportar")[1]);
    const [arq2, abas2] = baixar.mock.calls[1] as [string, { nome: string; linhas: Record<string, unknown>[] }[]];
    expect(arq2).toBe("Export_Detalhe.xlsx");
    expect(abas2[0].nome).toBe("Detalhe");
    expect(abas2[0].linhas).toHaveLength(60);
  });
});
