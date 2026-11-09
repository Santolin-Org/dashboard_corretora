// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { linha } from "../domain/helpers";

let rota = "/metas";
const F = encodeURIComponent(JSON.stringify({ vigIni: "2026-11-01", vigFim: "2026-11-30" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(`f=${F}`),
  usePathname: () => rota,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { FiltrosProvider } from "@/client/filtros";
import { FiltrosGlobais } from "@/components/FiltrosGlobais";

afterEach(cleanup);

const LINHAS = [
  linha({ colab: "PRODUZIU_2026", tipo: "N", vig: "2026-11-05" }),
  linha({ colab: "SO_EM_2025", tipo: "N", vig: "2025-11-20" }),
];
const opcoes = () => {
  const { container } = render(<FiltrosProvider linhas={LINHAS}><FiltrosGlobais temProducao /></FiltrosProvider>);
  return [...container.querySelectorAll<HTMLInputElement>("#ms-col input[data-valor]")].map((i) => i.dataset.valor);
};

describe("filtro de colaboradores: janela da aba Metas", () => {
  it("na aba Metas inclui quem produziu só no mesmo mês do ano anterior", () => {
    rota = "/metas";
    expect(opcoes()).toEqual(["PRODUZIU_2026", "SO_EM_2025"]);
  });

  it("nas outras abas continua só quem produziu no período filtrado", () => {
    rota = "/producao";
    expect(opcoes()).toEqual(["PRODUZIU_2026"]);
  });
});
