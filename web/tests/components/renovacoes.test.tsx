// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { Linha } from "@/domain/tipos";

let busca = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(busca),
  usePathname: () => "/renovacoes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

let papel: "gestao" | "admin" | "vendedor" = "gestao";
vi.mock("@/client/usuario", () => ({
  useUsuario: () => ({ usuario: { email: "g@x", nome: "G", role: papel, nomes: [] }, carregando: false, falhou: false, recarregar: () => {} }),
}));

import { EstadoAbasProvider } from "@/client/estadoAbas";
import { aplicarAtribuicoes, type Atribuicao } from "@/domain/atribuicoes";
import { FiltrosProvider } from "@/client/filtros";
import { ContextoPainel } from "@/client/painel";
import { ABAS, ABAS_PRODUCAO } from "@/components/Abas";
import Renovacoes from "@/app/(dash)/renovacoes/Renovacoes";

// hoje = 09/11/2026, sem vigência global: o período é novembro/2026 inteiro. Números fictícios.
const L: Linha[] = [
  linha({ cli: "José Renovou", docDigits: "111", ramo: "Auto", tipo: "N", sit: "Renovada", vig: "2025-11-05", fim: "2026-11-05", premio: 1000, com: 100, apolice: "A1" }),
  linha({ cli: "José Renovou", docDigits: "111", ramo: "Auto", tipo: "R", sit: "Ativa", vig: "2026-11-05", fim: "2027-11-05", premio: 1200, com: 130, apolice: "A1-NOVA" }),
  linha({ cli: "Maria Venceu", docDigits: "222", ramo: "Residencial", tipo: "R", sit: "Vencida", vig: "2025-11-07", fim: "2026-11-07", premio: 500, com: 50, apolice: "B1" }),
  linha({ cli: "Pedro Aberto", docDigits: "333", ramo: "Vida", tipo: "N", sit: "Ativa", vig: "2025-11-25", fim: "2026-11-25", premio: 300, com: 30, apolice: "C1" }),
  linha({ cli: "Ana Cancelou", docDigits: "444", ramo: "Auto", tipo: "N", sit: "Cancelada", vig: "2025-11-20", fim: "2026-11-20", premio: 900, com: 90, apolice: "D1" }),
];
const base = (linhas: Linha[]) => ({ linhas, sinistros: [], hoje: "2026-11-09", manifesto: [], avisosSaude: [], contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } }) as unknown as BaseCliente;

const salvar = vi.fn(async () => {}), desfazer = vi.fn(async () => {});
function montar(linhas = L, atribs: Atribuicao[] = [], extra: { atribuicoesErro?: boolean } = {}) {
  const ap = aplicarAtribuicoes(linhas, atribs);
  const b = base(ap.linhas);
  return render(
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{
        base: b, recarregar: () => {}, abrirFontes: () => {}, atribuicoes: atribs, divergencias: ap.divergencias,
        salvarAtribuicao: salvar, desfazerAtribuicao: desfazer, ...extra,
      }}>
        <FiltrosProvider linhas={b.linhas}><Renovacoes /></FiltrosProvider>
      </ContextoPainel.Provider>
    </EstadoAbasProvider>,
  );
}
afterEach(() => { cleanup(); papel = "gestao"; salvar.mockClear(); desfazer.mockClear(); });

describe("aba Renovações", () => {
  it("está no menu e é uma aba de produção", () => {
    expect(ABAS.some((a) => a.id === "renovacoes" && a.rotulo === "Renovações")).toBe(true);
    expect(ABAS_PRODUCAO).toContain("renovacoes");
  });

  it("cards: renovações × o que chegou para renovar, sem a cancelada", () => {
    const { container } = montar();
    const kpis = container.querySelector("#renov-kpis")!;
    const texto = kpis.textContent!.replace(/ /g, " ");
    expect(texto).toContain("R$ 1.200,00 de R$ 1.800,00"); // prêmio
    expect(texto).toContain("R$ 130,00 de R$ 180,00"); // comissão
    expect(texto).toContain("1 de 3");
    expect(texto).toContain("1 renovadas · 1 vencidas · 1 em aberto");
    expect(container.querySelector("#renov-periodo")!.textContent).toContain("01/11/2026 a 30/11/2026");
  });

  it("lista apólice por apólice com a renovação ligada e a situação", () => {
    montar();
    const tabela = screen.getByRole("table");
    const linhas = within(tabela).getAllByRole("row").slice(1).map((r) => r.textContent!.replace(/ /g, " "));
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("José Renovou");
    expect(linhas[0]).toContain("R$ 1.000,00");
    expect(linhas[0]).toContain("R$ 1.200,00");
    expect(linhas[0]).toContain("Renovada");
    expect(linhas[1]).toMatch(/Maria Venceu.*—.*Vencida/);
    expect(linhas[2]).toMatch(/Pedro Aberto.*Em aberto/);
    expect(tabela.textContent).not.toContain("Ana Cancelou");
  });

  it("a busca filtra a lista sem mexer nos cards", () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "maria" } });
    const linhas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toContain("Maria Venceu");
    expect(container.querySelector("#renov-badge")!.textContent).toBe("1 apólices");
    expect(container.querySelector("#renov-kpis")!.textContent!.replace(/ /g, " ")).toContain("1 de 3");
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "ninguém" } });
    expect(screen.getByText("Nenhuma apólice encontrada para essa busca.")).toBeTruthy();
  });

  it("pagina de 50 em 50 e a busca volta para a página 1", () => {
    const muitas = Array.from({ length: 60 }, (_, i) => linha({ cli: `Cli ${String(i).padStart(2, "0")}`, docDigits: `9${i}`, tipo: "N", sit: "Vencida", fim: "2026-11-10", apolice: `M${i}` }));
    montar(muitas);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(51);
    fireEvent.click(screen.getByText("Próxima →"));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(11);
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "cli" } });
    expect(screen.getByText("Página 1 de 2")).toBeTruthy();
  });

  it("filtra a lista por situação, junto com a busca, e mostra a contagem em cada botão", () => {
    const { container } = montar();
    const botao = (nome: RegExp) => screen.getByRole("button", { name: nome });
    expect(botao(/^Todas \(3\)/)).toBeTruthy();
    expect(botao(/^Renovadas \(1\)/)).toBeTruthy();
    expect(botao(/^Vencidas \(1\)/)).toBeTruthy();
    expect(botao(/^Em aberto \(1\)/)).toBeTruthy();
    const nomes = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.children[0].textContent);
    fireEvent.click(botao(/^Vencidas/));
    expect(nomes()).toEqual(["Maria Venceu"]);
    expect(botao(/^Vencidas/).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("#renov-badge")!.textContent).toBe("1 apólices");
    fireEvent.click(botao(/^Em aberto/));
    expect(nomes()).toEqual(["Pedro Aberto"]);
    // Busca e situação juntas: nada de "Pedro" entre as renovadas.
    fireEvent.click(botao(/^Renovadas/));
    fireEvent.change(screen.getByLabelText("Buscar renovações"), { target: { value: "pedro" } });
    expect(screen.getByText("Nenhuma apólice encontrada com essa busca e situação.")).toBeTruthy();
    fireEvent.click(botao(/^Todas/));
    expect(nomes()).toEqual(["Pedro Aberto"]);
    // Os cards não mudam com o filtro da lista.
    expect(container.querySelector("#renov-kpis")!.textContent!.replace(/\u00a0/g, " ")).toContain("1 de 3");
  });

  describe("atribuição de renovações", () => {
    // Fictício: B1 (Maria, colab "C" da planilha) atribuída a BIA; A1 (José) atribuída a CAIO, e a R dele saiu no nome "C".
    const at = (apolice: string, fim: string, para: string): Atribuicao => ({ seg: "Allianz", apolice, fim, para, de: "C", por: "g", em: "2026-11-10T00:00:00Z" });
    const ATRIBS = [at("B1", "2026-11-07", "BIA - EQUIPE"), at("A1", "2026-11-05", "CAIO")];
    const linhaDe = (nome: string) => within(screen.getByRole("table")).getAllByRole("row").find((r) => r.textContent!.includes(nome))!;

    it("gestão atribui pelo botão da linha: escolhe o colaborador e salva", async () => {
      montar(L.concat([linha({ colab: "BIA - EQUIPE", apolice: "X", fim: "2020-01-01" })]));
      fireEvent.click(within(linhaDe("Pedro Aberto")).getByRole("button", { name: "Atribuir" }));
      fireEvent.change(screen.getByLabelText("Novo responsável"), { target: { value: "BIA - EQUIPE" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
      await vi.waitFor(() => expect(salvar).toHaveBeenCalledWith({ seg: "Allianz", apolice: "C1", fim: "2026-11-25", para: "BIA - EQUIPE", de: "C" }));
    });

    it("vendedor não vê o botão Atribuir nem o aviso de divergências", () => {
      papel = "vendedor";
      montar(L, ATRIBS);
      expect(screen.queryByRole("button", { name: "Atribuir" })).toBeNull();
      expect(screen.queryByText(/saiu no nome de outro colaborador|saíram no nome de outro colaborador/)).toBeNull();
    });

    it("linha atribuída mostra o responsável, o selo e volta ao original", async () => {
      montar(L, ATRIBS);
      const maria = linhaDe("Maria Venceu");
      expect(maria.children[3].textContent).toContain("BIA");
      expect(within(maria).getByText("atribuída").getAttribute("title")).toBe("Na planilha: C");
      fireEvent.click(within(maria).getByRole("button", { name: "Atribuir" }));
      fireEvent.click(screen.getByRole("button", { name: "Voltar ao original" }));
      await vi.waitFor(() => expect(desfazer).toHaveBeenCalledWith({ seg: "Allianz", apolice: "B1", fim: "2026-11-07" }));
    });

    it("aviso de divergências com contagem e filtro só para elas", () => {
      montar(L, ATRIBS);
      expect(screen.getByText("1 renovação saiu no nome de outro colaborador.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Ver divergências" }));
      const linhas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].textContent).toContain("José Renovou");
      expect(within(linhas[0]).getByText(/divergente/).getAttribute("title")).toBe("Renovação no nome de C; atribuída a CAIO");
    });

    it("filtro de colaborador global usa o responsável atribuído", () => {
      busca = `f=${encodeURIComponent(JSON.stringify({ col: ["CAIO"] }))}`;
      montar(L, ATRIBS);
      const nomes = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.children[0].textContent);
      busca = "";
      expect(nomes).toEqual(["José Renovou"]);
    });

    it("sem as atribuições (banco fora), a gestão vê o aviso", () => {
      montar(L, [], { atribuicoesErro: true });
      expect(screen.getByText(/Não foi possível carregar as atribuições/)).toBeTruthy();
    });
  });
});
