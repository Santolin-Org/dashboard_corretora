// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { linha } from "../domain/helpers";

const criados: { id: string; cfg: ChartConfiguration }[] = [];
vi.mock("chart.js/auto", () => ({
  default: class {
    constructor(c: HTMLCanvasElement, cfg: ChartConfiguration) { criados.push({ id: c.id, cfg }); }
    destroy() {}
  },
}));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { BlocoGrafico } from "@/app/(dash)/comparativo/BlocoGrafico";
import type { Agrupamento, BaseComparacao, DadosComp, MetricaComp } from "@/domain/comparativo";

afterEach(() => { cleanup(); criados.length = 0; });

const n = (vig: string, premio: number) => linha({ tipo: "N", vig, premio });
const D: DadosComp = {
  start: "2025-01-01", end: "2026-12-31", prev: { start: "2024-01-01", end: "2025-12-31" }, emPrev: { start: "", end: "" },
  atual: [n("2025-04-10", 200), n("2026-04-15", 300), n("2026-07-15", 600)],
  anterior: [n("2024-04-10", 100), n("2025-04-10", 200)],
};

function Aba() {
  const [metrica, setMetrica] = useState<MetricaComp>("premio_novo");
  const [agrup, setAgrup] = useState<Agrupamento>("mes");
  const [base, setBase] = useState<BaseComparacao>("ano");
  return <BlocoGrafico d={D} metrica={metrica} aoMudar={setMetrica} hoje="2026-10-29"
    agrupamento={agrup} aoMudarAgrupamento={setAgrup} base={base} aoMudarBase={setBase} />;
}
const ultimo = () => criados.filter((c) => c.id === "ch-comp-main").at(-1)!.cfg;

describe("gráfico do Comparativo agrupado", () => {
  it("abre por mês; Trimestre troca título e barras para trimestres fechados; Período anterior troca a base e a legenda", async () => {
    render(<EstadoAbasProvider><Aba /></EstadoAbasProvider>);
    expect(screen.getByText("Evolução mensal comparativa")).toBeTruthy();
    await waitFor(() => expect(criados.length).toBeGreaterThan(0));
    expect(ultimo().data.labels).toHaveLength(24);

    fireEvent.click(screen.getByLabelText("Trimestre"));
    expect(screen.getByText("Evolução trimestral comparativa")).toBeTruthy();
    await waitFor(() => expect(ultimo().data.labels).toEqual(["T1/25", "T2/25", "T3/25", "T4/25", "T1/26", "T2/26", "T3/26"]));
    expect(ultimo().data.datasets[0].data).toEqual([0, 200, 0, 0, 0, 300, 600]);
    expect(ultimo().data.datasets[1].data).toEqual([0, 100, 0, 0, 0, 200, 0]);
    expect(screen.getByText(/Só períodos fechados/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Período imediatamente anterior"));
    await waitFor(() => expect(ultimo().data.datasets[1].data).toEqual([0, 0, 200, 0, 0, 0, 300]));
    expect(screen.getAllByText("Período imediatamente anterior").length).toBeGreaterThan(1); // opção + legenda
  });
});
