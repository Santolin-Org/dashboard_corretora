// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { linha } from "../domain/helpers";

let busca = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => busca,
  usePathname: () => "/visao-geral",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("chart.js/auto", () => ({ default: class { destroy() {} } }));

import { EstadoAbasProvider, useEstadoAba } from "@/client/estadoAbas";
import { FiltrosProvider, useFiltros } from "@/client/filtros";
import { BlocoCancelamentos } from "@/app/(dash)/visao-geral/BlocoCancelamentos";
import { BlocoEvolucao } from "@/app/(dash)/visao-geral/BlocoEvolucao";

beforeEach(() => { busca = new URLSearchParams(); window.history.replaceState(null, "", "/visao-geral"); });
afterEach(() => cleanup());

function Contador({ chave }: { chave: string }) {
  const [n, setN] = useEstadoAba(chave, 0);
  return <button type="button" onClick={() => setN((a) => a + 1)}>n={n}</button>;
}
function Rotas() {
  const [rota, setRota] = useState<"a" | "b">("a");
  return (
    <>
      <button type="button" onClick={() => setRota(rota === "a" ? "b" : "a")}>trocar</button>
      {rota === "a" ? <Contador chave="aba-a:n" /> : <p>outra aba</p>}
    </>
  );
}

describe("useEstadoAba", () => {
  it("o valor sobrevive ao desmonte do componente (troca de aba e volta)", () => {
    render(<EstadoAbasProvider><Rotas /></EstadoAbasProvider>);
    fireEvent.click(screen.getByText("n=0"));
    fireEvent.click(screen.getByText("n=1"));
    fireEvent.click(screen.getByText("trocar"));
    expect(screen.getByText("outra aba")).toBeTruthy();
    fireEvent.click(screen.getByText("trocar"));
    expect(screen.getByText("n=2")).toBeTruthy();
  });
  it("não persiste fora da store: um provider novo começa do valor inicial (como recarregar a página)", () => {
    const { unmount } = render(<EstadoAbasProvider><Contador chave="x" /></EstadoAbasProvider>);
    fireEvent.click(screen.getByText("n=0"));
    unmount();
    render(<EstadoAbasProvider><Contador chave="x" /></EstadoAbasProvider>);
    expect(screen.getByText("n=0")).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });
  it("chaves diferentes não se misturam e dois consumidores da mesma chave ficam em sincronia", () => {
    render(<EstadoAbasProvider><Contador chave="a" /><Contador chave="b" /><Contador chave="a" /></EstadoAbasProvider>);
    fireEvent.click(screen.getAllByText("n=0")[0]);
    expect(screen.getAllByText("n=1")).toHaveLength(2);
    expect(screen.getAllByText("n=0")).toHaveLength(1);
  });
  it("setter aceita função e valor", () => {
    function C() {
      const [v, s] = useEstadoAba("k", 5);
      return <><p>v={v}</p><button type="button" onClick={() => s((a) => a * 2)}>dobrar</button><button type="button" onClick={() => s(3)}>tres</button></>;
    }
    render(<EstadoAbasProvider><C /></EstadoAbasProvider>);
    fireEvent.click(screen.getByText("dobrar"));
    expect(screen.getByText("v=10")).toBeTruthy();
    fireEvent.click(screen.getByText("tres"));
    expect(screen.getByText("v=3")).toBeTruthy();
  });
  it("fora do provider lança erro claro", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Contador chave="x" />)).toThrow(/EstadoAbasProvider/);
    erro.mockRestore();
  });
});

describe("geracaoLimpeza (Limpar filtros)", () => {
  function Sonda() {
    const f = useFiltros();
    return (
      <>
        <p>ger={f.geracaoLimpeza}</p>
        <button type="button" onClick={() => f.definir({ vigIni: "2026-01-01" })}>definir</button>
        <button type="button" onClick={f.limpar}>limpar</button>
      </>
    );
  }
  it("só limpar() incrementa; definir() não", () => {
    render(<FiltrosProvider linhas={[linha()]}><Sonda /></FiltrosProvider>);
    expect(screen.getByText("ger=0")).toBeTruthy();
    fireEvent.click(screen.getByText("definir"));
    expect(screen.getByText("ger=0")).toBeTruthy();
    fireEvent.click(screen.getByText("limpar"));
    expect(screen.getByText("ger=1")).toBeTruthy();
    fireEvent.click(screen.getByText("limpar"));
    expect(screen.getByText("ger=2")).toBeTruthy();
  });
});

describe("Visão geral: estado na store da casca", () => {
  const canceladas = [
    linha({ sit: "Cancelada", motivo: "Preço" }), linha({ sit: "Cancelada", motivo: "Preço" }), linha({ sit: "Cancelada", motivo: "Saúde" }),
  ];
  function Cancel({ fd, ger, visivel }: { fd: ReturnType<typeof linha>[]; ger: number; visivel: boolean }) {
    return visivel ? <BlocoCancelamentos fd={fd} geracaoLimpeza={ger} /> : <p>outra aba</p>;
  }

  it("seleção de motivos e lista aberta sobrevivem à troca de aba; Limpar filtros zera a seleção (mesmo com o mesmo FD)", () => {
    const { rerender, container } = render(<EstadoAbasProvider><Cancel fd={canceladas} ger={0} visivel /></EstadoAbasProvider>);
    expect(container.querySelector("#cancel-filter-count")!.textContent).toBe("todos");
    fireEvent.click(container.querySelector(".cancel-filter-header")!);
    fireEvent.click(container.querySelector("#cb-Sa_de")!); // desmarca "Saúde"
    expect(container.querySelector("#cancel-filter-count")!.textContent).toBe("1 de 2");

    rerender(<EstadoAbasProvider><Cancel fd={canceladas} ger={0} visivel={false} /></EstadoAbasProvider>);
    expect(screen.getByText("outra aba")).toBeTruthy();
    rerender(<EstadoAbasProvider><Cancel fd={canceladas} ger={0} visivel /></EstadoAbasProvider>);
    expect(container.querySelector("#cancel-filter-count")!.textContent).toBe("1 de 2");
    expect(container.querySelector("#cancel-cb-list")!.className).toContain("open");

    // resetFilters: activeCancelMotivos = null, mesmo que o FD seja o mesmo array
    rerender(<EstadoAbasProvider><Cancel fd={canceladas} ger={1} visivel /></EstadoAbasProvider>);
    expect(container.querySelector("#cancel-filter-count")!.textContent).toBe("todos");
  });

  it("rádio de métrica da evolução sobrevive à troca de aba", () => {
    const hoje = "2026-10-15";
    const vis = (v: boolean) => <EstadoAbasProvider>{v ? <BlocoEvolucao fd={[linha()]} hoje={hoje} /> : <p>outra aba</p>}</EstadoAbasProvider>;
    const { rerender, container } = render(vis(true));
    fireEvent.click(container.querySelector("#mt-evol-c")!);
    expect((container.querySelector("#mt-evol-c") as HTMLInputElement).checked).toBe(true);
    rerender(vis(false));
    rerender(vis(true));
    expect((container.querySelector("#mt-evol-c") as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector("#mt-evol-p") as HTMLInputElement).checked).toBe(false);
  });
});
