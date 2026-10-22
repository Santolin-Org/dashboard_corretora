// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Podio } from "@/app/(dash)/crosssell/BlocoCampanha";
import { FotoColaborador, iniciais } from "@/components/FotoColaborador";

describe("pódio com fotos dos colaboradores", () => {
  afterEach(() => cleanup());

  it("iniciais: primeira letra do primeiro e do último nome", () => {
    expect(iniciais("Victor Augusto Lima")).toBe("VL");
    expect(iniciais("Gabriel")).toBe("G");
    expect(iniciais("—")).toBe("");
  });

  it("sem foto cadastrada mostra o placeholder com as iniciais", () => {
    const { container } = render(<FotoColaborador colab="Victor Augusto Lima" url={null} />);
    const el = container.querySelector("[data-foto]")!;
    expect(el.getAttribute("data-foto")).toBe("placeholder");
    expect(el.textContent).toBe("VL");
    expect(el.getAttribute("aria-label")).toBe("Foto de Victor Augusto Lima (ainda não cadastrada)");
  });

  it("com foto cadastrada mostra a imagem", () => {
    const { container } = render(<FotoColaborador colab="Ana" url="/fotos/ana.jpg" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/fotos/ana.jpg");
    expect(img.getAttribute("alt")).toBe("Foto de Ana");
  });

  it("Podio com `colabs` põe uma foto em cada degrau; sem `colabs` fica como antes (sem foto)", () => {
    const nomes: [string, string, string] = ["Victor A.", "Gabriel D.", "—"];
    const com = render(<Podio nomes={nomes} colabs={["Victor Alves", "Gabriel Dias", null]} />).container;
    expect(com.querySelectorAll("[data-foto]").length).toBe(2); // o 3º lugar vazio não tem foto
    cleanup();
    const sem = render(<Podio nomes={nomes} />).container;
    expect(sem.querySelectorAll("[data-foto]").length).toBe(0);
  });
});
