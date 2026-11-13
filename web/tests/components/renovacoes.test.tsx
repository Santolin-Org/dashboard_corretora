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
import { ContextoPainel, type ValorPainel } from "@/client/painel";
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
const salvarLote = vi.fn<(itens: unknown[]) => Promise<void>>(async () => {});
function montar(linhas = L, atribs: Atribuicao[] = [], extra: Partial<ValorPainel> = {}) {
  const ap = aplicarAtribuicoes(linhas, atribs);
  const b = base(ap.linhas);
  return render(
    <EstadoAbasProvider>
      <ContextoPainel.Provider value={{
        base: b, recarregar: () => {}, abrirFontes: () => {}, atribuicoes: atribs, divergencias: ap.divergencias,
        salvarAtribuicao: salvar, desfazerAtribuicao: desfazer, salvarAtribuicoesLote: salvarLote, ...extra,
      }}>
        <FiltrosProvider linhas={b.linhas}><Renovacoes /></FiltrosProvider>
      </ContextoPainel.Provider>
    </EstadoAbasProvider>,
  );
}
// Célula pela coluna do cabeçalho (a gestão tem a coluna de seleção antes de "Cliente").
const celula = (linhaTabela: Element, coluna: string) => {
  const cab = [...within(screen.getByRole("table")).getAllByRole("columnheader")].map((h) => h.textContent);
  return linhaTabela.children[cab.indexOf(coluna)];
};
afterEach(() => { cleanup(); papel = "gestao"; salvar.mockClear(); desfazer.mockClear(); salvarLote.mockReset(); salvarLote.mockImplementation(async () => {}); });

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
    const nomes = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => celula(r, "Cliente").textContent);
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

  describe("renovações de outros vencimentos", () => {
    // Lucas: R de novembro sem antiga que vence em novembro (renovação de outro vencimento). Fictício.
    const LUCAS = linha({ cli: "Lucas Outro", docDigits: "666", ramo: "Auto", tipo: "R", sit: "Ativa", vig: "2026-11-15", fim: "2027-11-15", premio: 800, com: 80, apolice: "L1" });

    it("o card conta só o que renovou do que chegou; as de outros vencimentos aparecem à parte", () => {
      const { container } = montar(L.concat([LUCAS]));
      const kpis = container.querySelector("#renov-kpis")!.parentElement!.textContent!.replace(/\u00a0/g, " ");
      expect(kpis).toContain("R$ 1.200,00 de R$ 1.800,00");
      expect(kpis).toContain("1 de 3");
      expect(kpis).toContain("+1 renovação de outros vencimentos (R$ 800,00 de prêmio, R$ 80,00 de comissão) fora da conta.");
    });

    it("o filtro Outros vencimentos lista essas renovações, com a busca", () => {
      montar(L.concat([LUCAS]));
      expect(screen.getByRole("button", { name: "Todas (3)" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Outros vencimentos (1)" }));
      const linhas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].textContent).toContain("Lucas Outro");
      expect(linhas[0].textContent).toContain("Sem apólice anterior ligada");
      // Essas linhas não têm atribuição (ela é feita na apólice que vence).
      expect(within(linhas[0]).queryByRole("checkbox")).toBeNull();
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar renovações" }), { target: { value: "José" } });
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByText("Nenhuma renovação de outro vencimento para essa busca.")).toBeTruthy();
    });

    it("o link do card abre o filtro", () => {
      montar(L.concat([LUCAS]));
      fireEvent.click(screen.getByRole("button", { name: "Ver renovações de outros vencimentos" }));
      expect(screen.getByRole("button", { name: "Outros vencimentos (1)" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("sem nenhuma, nem a linha do card nem o botão aparecem", () => {
      montar();
      expect(screen.queryByText(/outros vencimentos/)).toBeNull();
    });
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
      expect(celula(maria, "Colaborador").textContent).toContain("BIA");
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
      const nomes = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => celula(r, "Cliente").textContent);
      busca = "";
      expect(nomes).toEqual(["José Renovou"]);
    });

    it("sem as atribuições (banco fora), a gestão vê o aviso", () => {
      montar(L, [], { atribuicoesErro: true });
      expect(screen.getByText(/Não foi possível carregar as atribuições/)).toBeTruthy();
    });
  });

  describe("atribuição em lote", () => {
    const COM_BIA = L.concat([linha({ colab: "BIA - EQUIPE", apolice: "X", fim: "2020-01-01" })]);
    const marcar = (cli: string) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`Selecionar ${cli}`) }));
    const barra = () => screen.getByRole("region", { name: "Atribuição em lote" });

    it("seleciona linhas e atribui todas de uma vez ao responsável escolhido", async () => {
      montar(COM_BIA);
      expect(screen.queryByRole("region", { name: "Atribuição em lote" })).toBeNull();
      marcar("Maria Venceu");
      marcar("Pedro Aberto");
      expect(within(barra()).getByText("2 selecionadas")).toBeTruthy();
      fireEvent.change(within(barra()).getByLabelText("Responsável das selecionadas"), { target: { value: "BIA - EQUIPE" } });
      fireEvent.click(within(barra()).getByRole("button", { name: "Atribuir 2" }));
      await vi.waitFor(() => expect(salvarLote).toHaveBeenCalledTimes(1));
      expect(salvarLote.mock.calls[0][0]).toEqual([
        { seg: "Allianz", apolice: "B1", fim: "2026-11-07", para: "BIA - EQUIPE", de: "C" },
        { seg: "Allianz", apolice: "C1", fim: "2026-11-25", para: "BIA - EQUIPE", de: "C" },
      ]);
      // Gravou: limpa a seleção e confirma.
      await vi.waitFor(() => expect(screen.getByRole("status", { name: "Resultado da atribuição em lote" }).textContent).toBe("2 renovações atribuídas a BIA - EQUIPE."));
      expect(screen.queryByRole("region", { name: "Atribuição em lote" })).toBeNull();
      expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    });

    it("o cabeçalho seleciona e desmarca todas as linhas da página", () => {
      montar(COM_BIA);
      const todas = screen.getByRole("checkbox", { name: "Selecionar todas desta página" });
      fireEvent.click(todas);
      expect(within(barra()).getByText("3 selecionadas")).toBeTruthy();
      fireEvent.click(todas);
      expect(screen.queryByRole("region", { name: "Atribuição em lote" })).toBeNull();
    });

    it("com mais de uma página, oferece selecionar todas as da lista filtrada", () => {
      const muitas = Array.from({ length: 60 }, (_, i) =>
        linha({ cli: `Cliente ${i}`, docDigits: `9${i}`, ramo: "Auto", tipo: "N", sit: "Ativa", vig: "2025-11-20", fim: "2026-11-20", apolice: `M${i}` }));
      montar(muitas);
      fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas desta página" }));
      expect(within(barra()).getByText("50 selecionadas")).toBeTruthy();
      fireEvent.click(within(barra()).getByRole("button", { name: "Selecionar todas as 60 da lista" }));
      expect(within(barra()).getByText("60 selecionadas")).toBeTruthy();
    });

    it("a seleção só vale para o que está na lista: a busca esconde, a barra não conta", () => {
      montar(COM_BIA);
      marcar("Maria Venceu");
      marcar("Pedro Aberto");
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar renovações" }), { target: { value: "Pedro" } });
      expect(within(barra()).getByText("1 selecionada")).toBeTruthy();
    });

    it("quem já é o colaborador da planilha fica de fora e a mensagem avisa", async () => {
      montar(COM_BIA.concat([linha({ cli: "Bia Cliente", docDigits: "555", ramo: "Auto", tipo: "N", sit: "Ativa", vig: "2025-11-26", fim: "2026-11-26", apolice: "E1", colab: "BIA - EQUIPE" })]));
      marcar("Pedro Aberto");
      marcar("Bia Cliente");
      fireEvent.change(within(barra()).getByLabelText("Responsável das selecionadas"), { target: { value: "BIA - EQUIPE" } });
      fireEvent.click(within(barra()).getByRole("button", { name: "Atribuir 2" }));
      await vi.waitFor(() => expect(salvarLote).toHaveBeenCalledTimes(1));
      expect(salvarLote.mock.calls[0][0]).toEqual([{ seg: "Allianz", apolice: "C1", fim: "2026-11-25", para: "BIA - EQUIPE", de: "C" }]);
      await vi.waitFor(() => expect(screen.getByRole("status", { name: "Resultado da atribuição em lote" }).textContent)
        .toBe("1 renovação atribuída a BIA - EQUIPE. 1 já era de BIA - EQUIPE na planilha e ficou como estava."));
    });

    it("falha ao gravar: mostra o erro e mantém a seleção", async () => {
      salvarLote.mockRejectedValueOnce(new Error("Banco indisponível."));
      montar(COM_BIA);
      marcar("Pedro Aberto");
      fireEvent.change(within(barra()).getByLabelText("Responsável das selecionadas"), { target: { value: "BIA - EQUIPE" } });
      fireEvent.click(within(barra()).getByRole("button", { name: "Atribuir 1" }));
      await vi.waitFor(() => expect(within(barra()).getByRole("alert").textContent).toBe("Banco indisponível."));
      expect(within(barra()).getByText("1 selecionada")).toBeTruthy();
    });

    it("Limpar seleção desmarca tudo", () => {
      montar(COM_BIA);
      marcar("Pedro Aberto");
      fireEvent.click(within(barra()).getByRole("button", { name: "Limpar seleção" }));
      expect(screen.queryByRole("region", { name: "Atribuição em lote" })).toBeNull();
    });

    it("vendedor não vê as caixas de seleção", () => {
      papel = "vendedor";
      montar(COM_BIA);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });
  });
});

describe("vínculo manual de renovações", () => {
  // Fictício: a apólice E1 da Ana Exemplo venceu; a renovação F1 saiu no nome do cônjuge (Bruno Exemplo, outro CPF).
  const ANA = linha({ cli: "Ana Exemplo", docDigits: "555", ramo: "Auto", tipo: "N", sit: "Renovada", vig: "2025-11-15", fim: "2026-11-15", premio: 800, com: 80, apolice: "E1", seg: "SegX" });
  const BRUNO = linha({ cli: "Bruno Exemplo", docDigits: "666", ramo: "Auto", tipo: "R", sit: "Ativa", vig: "2026-11-14", fim: "2027-11-14", premio: 900, com: 90, apolice: "F1", seg: "SegX" });
  const L2 = [...L, ANA, BRUNO];
  const V = { seg: "SegX", apolice: "E1", fim: "2026-11-15", renSeg: "SegX", renApolice: "F1", renVig: "2026-11-14" };
  const vincular = vi.fn();
  const desfazerV = vi.fn(async () => {});
  const ext = (o = {}) => ({ vincularRenovacao: vincular, desfazerVinculoRenovacao: desfazerV, ...o });
  const linhaDe = (cli: string) => screen.getAllByRole("row").find((r) => r.textContent!.includes(cli))!;
  afterEach(() => { vincular.mockReset(); desfazerV.mockClear(); vi.restoreAllMocks(); });

  it("vendedor não vê os botões de vínculo", () => {
    papel = "vendedor";
    montar(L2, [], ext());
    expect(screen.queryByRole("button", { name: /Vincular renovação/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Outros vencimentos/ }));
    expect(screen.queryByRole("button", { name: /Vincular à apólice anterior/ })).toBeNull();
  });

  it("A: botão só na antiga sem renovação; o diálogo sugere a R e grava o par", async () => {
    vincular.mockResolvedValue({ ok: true, desfeitos: [] });
    montar(L2, [], ext());
    expect(within(linhaDe("José Renovou")).queryByRole("button", { name: /Vincular renovação/ })).toBeNull(); // já ligada
    fireEvent.click(within(linhaDe("Ana Exemplo")).getByRole("button", { name: /Vincular renovação/ }));
    const dlg = screen.getByRole("dialog", { name: /Vincular renovação/ });
    expect(within(dlg).getByText(/Qual apólice renovou a de Ana Exemplo/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("radio", { name: /Bruno Exemplo/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Vincular" }));
    await vi.waitFor(() => expect(vincular).toHaveBeenCalledWith(V));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("B: botão na renovação solta de outros vencimentos; o diálogo sugere a antiga", async () => {
    vincular.mockResolvedValue({ ok: true, desfeitos: [] });
    montar(L2, [], ext());
    fireEvent.click(screen.getByRole("button", { name: /^Outros vencimentos/ }));
    fireEvent.click(within(linhaDe("Bruno Exemplo")).getByRole("button", { name: /Vincular à apólice anterior/ }));
    const dlg = screen.getByRole("dialog", { name: /Vincular à apólice anterior/ });
    fireEvent.click(within(dlg).getByRole("radio", { name: /Ana Exemplo/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Vincular" }));
    await vi.waitFor(() => expect(vincular).toHaveBeenCalledWith(V));
  });

  it("conflito: pede confirmação; cancelar não grava de novo", async () => {
    vincular.mockResolvedValue({ ok: false, conflitos: [{ ...V, seg: "Allianz", apolice: "C1", fim: "2026-11-25", por: "g", em: "" }] });
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    montar(L2, [], ext());
    fireEvent.click(within(linhaDe("Ana Exemplo")).getByRole("button", { name: /Vincular renovação/ }));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByRole("radio", { name: /Bruno Exemplo/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Vincular" }));
    await vi.waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(confirmar.mock.calls[0][0]).toContain("Esta renovação já está vinculada a Pedro Aberto (apólice C1).");
    expect(confirmar.mock.calls[0][0]).toContain("Desfazer esse vínculo e vincular a esta?");
    expect(vincular).toHaveBeenCalledTimes(1);
  });

  it("conflito confirmado: substitui e avisa com link para a apólice que perdeu o vínculo", async () => {
    const desfeito = { ...V, seg: "Allianz", apolice: "C1", fim: "2026-11-25", por: "g", em: "" };
    vincular.mockResolvedValueOnce({ ok: false, conflitos: [desfeito] }).mockResolvedValueOnce({ ok: true, desfeitos: [desfeito] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    montar(L2, [], ext());
    fireEvent.click(within(linhaDe("Ana Exemplo")).getByRole("button", { name: /Vincular renovação/ }));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByRole("radio", { name: /Bruno Exemplo/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Vincular" }));
    await vi.waitFor(() => expect(vincular).toHaveBeenLastCalledWith(V, true));
    const aviso = await screen.findByRole("status", { name: /Vínculos desfeitos/ });
    expect(aviso.textContent).toContain("Vínculo desfeito na apólice C1");
    fireEvent.click(within(aviso).getByRole("button", { name: "C1" }));
    expect((screen.getByRole("searchbox", { name: "Buscar renovações" }) as HTMLInputElement).value).toBe("C1");
    expect(screen.getAllByRole("row").some((r) => r.textContent!.includes("Pedro Aberto"))).toBe(true);
  });

  it("linha vinculada: nome da antiga + 'renovada como', desfazer só no manual", async () => {
    montar(L2, [], ext({ vinculosRenovacao: [{ ...V, por: "g", em: "" }] }));
    const ana = linhaDe("Ana Exemplo");
    expect(within(ana).getByText("renovada como Bruno Exemplo")).toBeTruthy();
    expect(within(linhaDe("José Renovou")).queryByText(/renovada como/)).toBeNull(); // mesmo cliente
    expect(within(linhaDe("José Renovou")).queryByRole("button", { name: /Desfazer vínculo/ })).toBeNull(); // automático
    fireEvent.click(within(ana).getByRole("button", { name: /Desfazer vínculo/ }));
    await vi.waitFor(() => expect(desfazerV).toHaveBeenCalledWith({ seg: "SegX", apolice: "E1", fim: "2026-11-15" }));
    expect(screen.queryByRole("button", { name: /^Outros vencimentos/ })).toBeNull(); // a F1 saiu de outros
  });

  it("erro ao gravar aparece no diálogo e nada muda", async () => {
    vincular.mockRejectedValue(new Error("Banco indisponível"));
    montar(L2, [], ext());
    fireEvent.click(within(linhaDe("Ana Exemplo")).getByRole("button", { name: /Vincular renovação/ }));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByRole("radio", { name: /Bruno Exemplo/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Vincular" }));
    expect((await within(dlg).findByRole("alert")).textContent).toBe("Banco indisponível");
  });
});
