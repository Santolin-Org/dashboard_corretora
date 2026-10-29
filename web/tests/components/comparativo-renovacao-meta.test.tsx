// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { linha } from "../domain/helpers";
import { EstadoAbasProvider } from "@/client/estadoAbas";
import { BlocoKpis } from "@/app/(dash)/comparativo/BlocoKpis";
import { dadosComp } from "@/domain/comparativo";
import { FILTROS_VAZIOS } from "@/domain/filtros";

afterEach(cleanup);

const TODAS = [
  linha({ tipo: "N", ramo: "Automóvel - Casco", vig: "2025-03-10", fim: "2026-03-10", sit: "Renovada" }),
  linha({ tipo: "N", ramo: "Seguro Viagem Individual", vig: "2025-05-10", fim: "2026-05-10", sit: "Vencida" }),
];
const D = dadosComp(TODAS, FILTROS_VAZIOS, { start: "2026-01-01", end: "2026-10-29" });

function Aba() {
  const [so, setSo] = useState(false);
  return <BlocoKpis todas={TODAS} filtros={FILTROS_VAZIOS} d={D} renovacaoSoMeta={so} aoMudarRenovacaoSoMeta={setSo} />;
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
