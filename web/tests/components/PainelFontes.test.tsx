// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ManifestoFonte } from "@/domain/producao/base";
import { SAUDE_FILE, SAUDE_MODELO } from "@/domain/saude/modelo";

const xlsx = vi.hoisted(() => ({
  utils: { aoa_to_sheet: vi.fn(() => "ws"), book_new: vi.fn(() => "wb"), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));
vi.mock("xlsx", () => xlsx);

import { PainelFontes } from "@/components/PainelFontes";

const fonte = (o: Partial<ManifestoFonte> = {}): ManifestoFonte => ({
  nome: "producao_2026.xlsx", total: 1234, duplicadas: 0, anos: { min: 2026, max: 2026 }, ativasVencidas: 0,
  modificadoEm: "2026-10-10T12:00:00-03:00", anosIgnorados: [], sobreposicoes: [], ...o,
});
function montar(p: { manifesto?: ManifestoFonte[]; pode?: boolean; avisosSaude?: string[]; recarregar?: () => void; onFechar?: () => void } = {}) {
  return render(
    <PainelFontes aberto onFechar={p.onFechar ?? (() => {})} manifesto={p.manifesto ?? [fonte()]} totalLinhas={1234}
      avisosSaude={p.avisosSaude ?? []} podeReprocessar={p.pode ?? false} recarregar={p.recarregar ?? (() => {})} />,
  );
}
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); Object.values(xlsx.utils).forEach((f) => f.mockClear()); xlsx.writeFile.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PainelFontes", () => {
  it("fechado não renderiza; aberto traz os ids e o rodapé Total em memória", () => {
    const { container, rerender } = render(
      <PainelFontes aberto={false} onFechar={() => {}} manifesto={[]} totalLinhas={0} avisosSaude={[]} podeReprocessar={false} recarregar={() => {}} />,
    );
    expect(container.querySelector("#fontes-modal")).toBeNull();
    rerender(<PainelFontes aberto onFechar={() => {}} manifesto={[fonte()]} totalLinhas={1234} avisosSaude={[]} podeReprocessar={false} recarregar={() => {}} />);
    expect(container.querySelector("#fontes-modal #fontes-modal-body table.fontes-table")).not.toBeNull();
    expect(container.querySelector("tfoot")!.textContent).toContain("Total em memória");
    expect(container.querySelector("tfoot")!.textContent).toContain("1.234");
    expect(container.querySelector("tbody")!.textContent).toContain("2026");
  });

  it("mostra a linha de cobertura e a de sobreposição", () => {
    montar({ manifesto: [
      fonte({ nome: "producao_2025.xlsx", anos: { min: 2024, max: 2025 }, anosIgnorados: [{ ano: 2025, cobertoPor: "producao_2026.xlsx" }] }),
      fonte({ sobreposicoes: [{ ano: 2025, com: "producao_2025.xlsx", linhas: 11 }] }),
    ] });
    expect(screen.getByText("producao_2025.xlsx: 2025 ignorado, coberto por producao_2026.xlsx")).toBeTruthy();
    expect(screen.getByText("sobreposição em 2025 com producao_2025.xlsx (11 linhas)")).toBeTruthy();
    expect(screen.getByText("2024–2025")).toBeTruthy();
  });

  it("ativasVencidas >= 20 aplica o destaque e o aviso de desatualizado; 19 não", () => {
    const { container, unmount } = montar({ manifesto: [fonte({ ativasVencidas: 20 })] });
    expect(container.querySelector("tbody td.fontes-destaque")!.textContent).toBe("⚠️ 20");
    expect(container.querySelector(".fontes-warn")!.textContent).toContain("parece desatualizado");
    unmount();
    const r2 = montar({ manifesto: [fonte({ ativasVencidas: 19 })] });
    expect(r2.container.querySelector("td.fontes-destaque")).toBeNull();
    expect(r2.container.querySelector(".fontes-warn")).toBeNull();
  });

  it("duplicadas: aviso de linhas repetidas; vários desatualizados no plural", () => {
    const { container } = montar({ manifesto: [fonte({ duplicadas: 3, ativasVencidas: 30 }), fonte({ nome: "producao_2025.xlsx", ativasVencidas: 25 })] });
    const t = container.textContent!;
    expect(t).toContain("parecem desatualizados");
    expect(t).toContain("Há linhas repetidas entre arquivos");
  });

  it("saúde: linha de vinculadas/criadas com a contagem de avisos e a lista dos avisos", () => {
    montar({
      manifesto: [fonte({ nome: SAUDE_FILE, modificadoEm: "", anos: null, saude: { vinculadas: 5, criadas: 2, avisos: ["linha 3: sem apólice", "linha 9: data inválida"] } })],
      avisosSaude: ["linha 3: sem apólice", "linha 9: data inválida"],
    });
    expect(screen.getByText("5 vinculadas à produção · 2 criadas · 2 aviso(s)")).toBeTruthy();
    expect(screen.getByText("linha 9: data inválida")).toBeTruthy();
  });

  it("Esc e clique no fundo fecham", () => {
    const onFechar = vi.fn();
    const { container } = montar({ onFechar });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFechar).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector("#fontes-modal .export-modal-card")!);
    expect(onFechar).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector("#fontes-modal")!);
    expect(onFechar).toHaveBeenCalledTimes(2);
  });

  it("papel sem permissão não vê Reprocessar fontes", () => {
    montar({ pode: false });
    expect(screen.queryByText(/Reprocessar fontes/)).toBeNull();
  });

  it("admin reprocessa: POST, estado ocupado, depois recarregar()", async () => {
    let fim!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => { fim = r; }));
    const recarregar = vi.fn();
    montar({ pode: true, recarregar });
    fireEvent.click(screen.getByText(/Reprocessar fontes/));
    const ocupado = screen.getByText("Reprocessando…") as HTMLButtonElement;
    expect(ocupado.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/fontes/reprocessar", expect.objectContaining({ method: "POST" }));
    fim(new Response("{}", { status: 200 }));
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
    expect((screen.getByText(/Reprocessar fontes/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("falha do reprocessamento mostra o erro do JSON e não recarrega", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ erro: "Falha ao reprocessar as fontes" }), { status: 500 }));
    const recarregar = vi.fn();
    montar({ pode: true, recarregar });
    fireEvent.click(screen.getByText(/Reprocessar fontes/));
    expect((await screen.findByRole("alert")).textContent).toContain("Falha ao reprocessar as fontes");
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("Baixar modelo gera o xlsx com SAUDE_MODELO (import dinâmico)", async () => {
    montar();
    fireEvent.click(screen.getByText(/Baixar modelo da planilha de saúde/));
    await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalledWith("wb", SAUDE_FILE));
    expect(xlsx.utils.aoa_to_sheet).toHaveBeenCalledWith([SAUDE_MODELO]);
    expect(xlsx.utils.book_append_sheet).toHaveBeenCalledWith("wb", "ws", "Saúde");
  });
});
