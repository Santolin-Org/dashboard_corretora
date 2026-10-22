// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kpi } from "@/components/Kpi";
import { kpisCross } from "@/domain/crosssell";

describe("Kpi com valor em texto", () => {
  it("valor textual ganha a classe de texto e o nome completo no tooltip", () => {
    const { container } = render(<Kpi cor="k-blue" rotulo="Ramo mais popular" valor="Responsabilidade Civil Profissional" texto />);
    const v = container.querySelector(".kpi-value")!;
    expect(v.classList.contains("kpi-value-texto")).toBe(true);
    expect(v.getAttribute("title")).toBe("Responsabilidade Civil Profissional");
    expect(v.textContent).toBe("Responsabilidade Civil Profissional");
  });

  it("valor numérico continua sem a classe de texto", () => {
    const { container } = render(<Kpi cor="k-green" rotulo="Comissão" valor="R$ 1,00" />);
    expect(container.querySelector(".kpi-value")!.classList.contains("kpi-value-texto")).toBe(false);
  });
});

describe("kpisCross marca os cartões cujo valor é nome de ramo", () => {
  it("só 'Ramo mais popular' e 'Maior oportunidade' são texto", () => {
    const k = kpisCross([], [], []);
    expect(k.filter((c) => c.t).map((c) => c.l)).toEqual(["Ramo mais popular", "Maior oportunidade"]);
  });
});
