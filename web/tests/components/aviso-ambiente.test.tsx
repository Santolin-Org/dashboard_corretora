// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AvisoAmbiente } from "@/components/AvisoAmbiente";

afterEach(() => cleanup());

describe("AvisoAmbiente", () => {
  it("em preview mostra que não é a produção", () => {
    const { container } = render(<AvisoAmbiente ambiente="preview" />);
    expect(container.textContent).toContain("Ambiente de desenvolvimento");
  });
  it("em produção e local não mostra nada", () => {
    expect(render(<AvisoAmbiente ambiente="production" />).container.textContent).toBe("");
    expect(render(<AvisoAmbiente ambiente={undefined} />).container.textContent).toBe("");
  });
});
