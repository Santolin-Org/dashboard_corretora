// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelaAcesso, estiloAcesso } from "@/components/TelaAcesso";

afterEach(cleanup);

describe("TelaAcesso", () => {
  it("mostra título acessível e o conteúdo dentro do cartão", () => {
    const { getByRole, getByText } = render(
      <TelaAcesso titulo="Dashboard Corretora">
        <button type="submit" className={estiloAcesso.botao}>Entrar com Microsoft 365</button>
      </TelaAcesso>,
    );
    expect(getByRole("region", { name: "Dashboard Corretora" })).toBeTruthy();
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Dashboard Corretora");
    // Regressão: o botão de login saía sem estilo (retângulo branco que passava despercebido).
    const botao = getByText("Entrar com Microsoft 365");
    expect(botao.className).toContain(estiloAcesso.botao);
    expect(botao.closest("section")).not.toBeNull();
  });
});
