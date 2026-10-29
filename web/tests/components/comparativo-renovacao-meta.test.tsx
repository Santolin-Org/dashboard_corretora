// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useState } from "react";
import { linha } from "../domain/helpers";

const baixarPlanilha = vi.fn(async () => {});
vi.mock("@/client/exportar", () => ({ baixarPlanilha: (...a: unknown[]) => baixarPlanilha(...(a as [])) }));
import { EstadoAbasProvider } from "@/client/estadoAbas";
import { BlocoKpis } from "@/app/(dash)/comparativo/BlocoKpis";
import { dadosComp } from "@/domain/comparativo";
import { FILTROS_VAZIOS } from "@/domain/filtros";

afterEach(() => { cleanup(); baixarPlanilha.mockClear(); });

const TODAS = [
  linha({ tipo: "N", ramo: "Automóvel - Casco", vig: "2025-03-10", fim: "2026-03-10", sit: "Renovada" }),
  linha({ tipo: "N", ramo: "Seguro Viagem Individual", vig: "2025-05-10", fim: "2026-05-10", sit: "Vencida" }),
];
const D = dadosComp(TODAS, FILTROS_VAZIOS, { start: "2026-01-01", end: "2026-10-29" });

function Aba() {
  const [so, setSo] = useState(false);
  return <BlocoKpis todas={TODAS} filtros={FILTROS_VAZIOS} d={D} chips={["Sem filtros globais — carteira completa"]} renovacaoSoMeta={so} aoMudarRenovacaoSoMeta={setSo} />;
}
const valorTaxa = () => screen.getByText("Taxa de renovação").closest(".kpi-comp-card")!.querySelector(".kpi-comp-value")!.textContent;

describe("Indicadores complementares: opção de ramos que renovam", () => {
  it("desmarcada por padrão; marcar recalcula a taxa de renovação só com os ramos da meta", () => {
    render(<EstadoAbasProvider><Aba /></EstadoAbasProvider>);
    const caixa = screen.getByLabelText(/Renovação e churn só com ramos da meta/) as HTMLInputElement;
    expect(caixa.checked).toBe(false);
    expect(valorTaxa()).toBe("50.00%");
    fireEvent.click(caixa);
    expect(caixa.checked).toBe(true);
    expect(valorTaxa()).toBe("100.00%");
    expect(caixa.closest("[data-so-novo]")).toBeTruthy();
  });
});

describe("Indicadores complementares: exportar", () => {
  it("botão Exportar abre a escolha; Excel baixa a planilha com a opção marcada; Esc fecha", async () => {
    render(<EstadoAbasProvider><Aba /></EstadoAbasProvider>);
    fireEvent.click(screen.getByLabelText(/Renovação e churn só com ramos da meta/));
    const botao = screen.getByRole("button", { name: "↑ Exportar" });
    expect(botao.hasAttribute("data-so-novo")).toBe(true);
    fireEvent.click(botao);
    expect(screen.getByRole("dialog", { name: "Exportar indicadores" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "📊 Excel (.xlsx)" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(baixarPlanilha).toHaveBeenCalledTimes(1));
    const [arquivo, abas] = baixarPlanilha.mock.calls[0] as unknown as [string, { nome: string; linhas: Record<string, unknown>[] }[]];
    expect(arquivo).toBe("Comparativo_Indicadores_2026-01-01_a_2026-10-29.xlsx");
    const taxa = abas[0].linhas.find((l) => l.Indicador === "Taxa de renovação")!;
    expect(taxa["Período atual (01/01/2026 → 29/10/2026)"]).toBe(100);
    expect(abas[1].linhas.find((l) => l.Item === "Renovação e churn")!.Valor).toBe("Só ramos da meta; churn só evitável");

    fireEvent.click(botao);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
