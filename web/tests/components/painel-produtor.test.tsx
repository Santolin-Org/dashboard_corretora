// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ChartConfiguration } from "chart.js";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { Usuario } from "@/client/usuario";

// Chart.js não desenha em jsdom: um dublê que guarda a config.
const criados: { id: string; cfg: ChartConfiguration }[] = [];
vi.mock("chart.js/auto", () => ({
  default: class {
    constructor(c: HTMLCanvasElement, cfg: ChartConfiguration) { criados.push({ id: c.id, cfg }); }
    destroy() {}
  },
}));
let usuarioFake: { usuario: Usuario | null; carregando: boolean } = { usuario: null, carregando: true };
vi.mock("@/client/usuario", () => ({ useUsuario: () => usuarioFake }));

import { ContextoPainel } from "@/client/painel";
import { PainelProdutor } from "@/components/painel-produtor/PainelProdutor";
import { BlocoProducaoMes } from "@/components/painel-produtor/BlocoProducaoMes";
import { GraficoMesAMes } from "@/components/painel-produtor/GraficoMesAMes";
import MeuPainel from "@/app/(dash)/meu-painel/MeuPainel";

const GV = "GABRIEL VERAS - SANTOLIN";
const DUPLA = `GABRIELA ALENCAR MOZERLE - SANTOLIN , ${GV}`;
const LINHAS = [
  linha({ colab: GV, tipo: "N", fim: "2026-10-18", sit: "Vencida", cli: "Transportes Rocha", vig: "2025-10-18", premio: 100, com: 10 }),
  linha({ colab: GV, tipo: "R", fim: "2026-10-23", sit: "Ativa", cli: "Maria Lopes", vig: "2025-10-23" }),
  linha({ colab: DUPLA, tipo: "N", fim: "2026-10-25", sit: "Ativa", cli: "Carlos Prado", vig: "2025-10-25" }),
  linha({ colab: GV, tipo: "N", fim: "2026-09-10", sit: "Vencida", cli: "Setembro Cli", vig: "2025-09-10" }),
  linha({ colab: "OUTRO - SANTOLIN", tipo: "N", fim: "2026-10-24", sit: "Ativa", cli: "De Outro", vig: "2025-10-24" }),
  linha({ colab: GV, tipo: "N", vig: "2026-10-05", fim: "2027-10-05", premio: 600, com: 60, cli: "Nova Out" }),
];
const fakeBase = (linhas = LINHAS, extra: Partial<BaseCliente> = {}) =>
  ({ linhas, sinistros: [], hoje: "2026-10-22", manifesto: [], avisosSaude: [], ...extra }) as unknown as BaseCliente;

function Raiz({ children, base = fakeBase() }: { children: React.ReactNode; base?: BaseCliente }) {
  return <ContextoPainel.Provider value={{ base, recarregar: () => {}, abrirFontes: () => {} }}>{children}</ContextoPainel.Provider>;
}
const painel = (props: Partial<React.ComponentProps<typeof PainelProdutor>> = {}, base?: BaseCliente) =>
  render(<Raiz base={base}><PainelProdutor nomes={new Set([GV])} mostrarDono={false} saudacao="Olá, Gabriel" {...props} /></Raiz>);
const lista = () => screen.getByRole("region", { name: /A renovar/ });

// Roda o plugin inline de rótulos com um chart/contexto falsos e devolve os textos escritos.
function textosDoPlugin(cfg: ChartConfiguration, largura = 300): string[] {
  const escritos: string[] = [];
  const ctx = { save() {}, restore() {}, fillText: (t: string) => escritos.push(t), measureText: (t: string) => ({ width: t.length * 5 }) };
  const chart = {
    ctx, data: cfg.data,
    getDatasetMeta: (i: number) => ({ hidden: false, data: cfg.data.datasets[i].data.map(() => ({ getProps: () => ({ x: largura, y: 10, base: 0 }) })) }),
  };
  for (const p of cfg.plugins ?? []) (p.afterDatasetsDraw as unknown as (c: unknown) => void)?.(chart);
  return escritos;
}

beforeEach(() => { criados.length = 0; localStorage.clear(); });
afterEach(() => cleanup());

describe("A renovar", () => {
  it("abre no mês atual com selo 'atual'; ‹ vai para o mês anterior", () => {
    painel();
    const r = lista();
    expect(r.textContent).toContain("A renovar · 3 em outubro");
    expect(r.textContent).toContain("outubro/2026");
    expect(r.textContent).toContain("atual");
    expect(r.textContent).toContain("Transportes Rocha");
    expect(r.textContent).not.toContain("Setembro Cli");
    expect(r.textContent).not.toContain("De Outro");
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(r.textContent).toContain("setembro/2026");
    expect(r.textContent).not.toContain("atual");
    expect(r.textContent).toContain("Setembro Cli");
    expect(r.textContent).not.toContain("Transportes Rocha");
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(r.textContent).toContain("Nenhuma apólice a renovar em novembro/2026.");
  });

  it("selos de prazo: amanhã e venceu há 4 dias", () => {
    painel();
    expect(screen.getByText("amanhã")).toBeTruthy();
    expect(screen.getByText("venceu há 4 dias")).toBeTruthy();
    expect(screen.getByText("em 3 dias")).toBeTruthy();
  });

  it("vencidas minimizam, o botão alterna aria-expanded e o estado fica no localStorage", () => {
    painel();
    const b = screen.getByRole("button", { name: /minimizar/ });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(b);
    expect(lista().textContent).not.toContain("Transportes Rocha");
    expect(lista().textContent).toContain("Maria Lopes");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.textContent).toContain("mostrar");
    expect(localStorage.getItem("painelProdutor:vencidasMin")).toBe("1");
    cleanup();
    painel(); // lembrado
    expect(lista().textContent).not.toContain("Transportes Rocha");
    fireEvent.click(screen.getByRole("button", { name: /mostrar/ }));
    expect(lista().textContent).toContain("Transportes Rocha");
  });

  it("localStorage indisponível não quebra o painel", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    painel();
    fireEvent.click(screen.getByRole("button", { name: /minimizar/ }));
    expect(lista().textContent).not.toContain("Transportes Rocha");
    get.mockRestore(); set.mockRestore();
  });

  it("mostrarDono acrescenta o nome curto do colaborador (dupla mostra os dois)", () => {
    painel({ mostrarDono: true });
    expect(lista().textContent).toContain("GABRIELA ALENCAR MOZERLE");
    cleanup();
    painel({ mostrarDono: false });
    expect(lista().textContent).not.toContain("GABRIELA ALENCAR MOZERLE");
  });
});

describe("Minha produção no mês", () => {
  it("três números do mês e selo de variação oculto sem o mesmo mês do ano anterior", () => {
    const { container } = painel({}, fakeBase([LINHAS[5]])); // nada em out/2025
    expect(container.textContent).toContain("Minha produção em outubro");
    const kpis = screen.getByRole("group", { name: "Números do mês" });
    expect(kpis.textContent).toContain("Apólices1");
    expect(kpis.textContent).toMatch(/Prêmio líquidoR\$\s600,00/);
    expect(kpis.textContent).toMatch(/ComissãoR\$\s60,00/);
    expect(container.textContent).not.toContain("sobre outubro/2025");
  });

  it("selo ▲ com o mês do ano anterior; barras N+R com rótulos", async () => {
    const linhas = [...LINHAS, linha({ colab: GV, tipo: "R", vig: "2025-10-10", premio: 300, com: 30 })];
    const { container } = render(<Raiz base={fakeBase(linhas)}><BlocoProducaoMes nomes={new Set([GV])} /></Raiz>);
    // out/2025: 100 (N) + 100 (R, Maria) + 100 (N, Carlos dupla) + 300 = 600 → out/2026: 600 → 0,0%
    expect(container.textContent).toContain("▲ 0,0% sobre outubro/2025");
    expect(container.textContent).toMatch(/out\/2026Total R\$\s600,00 · comissão R\$\s60,00/);
    await waitFor(() => expect(criados.some((c) => c.id === "pp-nr")).toBe(true));
    const nr = criados.find((c) => c.id === "pp-nr")!;
    expect(nr.cfg.options!.indexAxis).toBe("y");
    expect(nr.cfg.data.labels).toEqual(["out/2025", "out/2026"]);
    expect(nr.cfg.data.datasets.map((d) => [d.label, d.data])).toEqual([["Novas (N)", [200, 600]], ["Renovações (R)", [400, 0]]]);
    expect(textosDoPlugin(nr.cfg)).toEqual(["N R$ 200", "N R$ 600", "R R$ 400"]); // zero não escreve
    expect(textosDoPlugin(nr.cfg, 20)).toEqual([]); // não cabe no segmento
  });

  // Um gráfico por render: no vitest, um segundo import() simultâneo do chart.js/auto mockado
  // devolve o módulo real (e o dublê não registra a config).
  it("mês a mês: dois eixos, meses futuros sem barra", async () => {
    render(<Raiz><GraficoMesAMes nomes={new Set([GV])} /></Raiz>);
    await waitFor(() => expect(criados.some((c) => c.id === "pp-mes")).toBe(true));
    const mm = criados.find((c) => c.id === "pp-mes")!;
    const [p, c] = mm.cfg.data.datasets as { label: string; data: (number | null)[]; yAxisID: string }[];
    expect([p.label, p.yAxisID, c.label, c.yAxisID]).toEqual(["Prêmio líquido", "y", "Comissão", "y1"]);
    expect(p.data[9]).toBe(600);
    expect(p.data.slice(10)).toEqual([null, null]);
    expect((mm.cfg.options!.scales as Record<string, { display?: boolean }>).y1.display).toBe(false);
    expect(textosDoPlugin(mm.cfg)).toEqual(["600", "60"]); // só outubro tem valor; futuros (null) sem rótulo
  });

  it("vendedor novato (zero linhas): blocos vazios sem erro", () => {
    const { container } = painel({}, fakeBase([]));
    expect(container.textContent).toContain("Nenhuma apólice a renovar em outubro/2026.");
    expect(container.textContent).not.toContain("sobre");
    expect(container.textContent).toContain("Nenhuma produção em outubro");
  });
});

describe("página Meu painel", () => {
  const u = (nomes: string[], role: Usuario["role"] = "vendedor"): Usuario => ({ email: "g@x", nome: "Gabriel Veras", role, nomes });
  it("enquanto o usuário carrega, nada", () => {
    usuarioFake = { usuario: null, carregando: true };
    const { container } = render(<Raiz><MeuPainel /></Raiz>);
    expect(container.textContent).toBe("");
  });
  it("sem nomes vinculados: aviso exato e nenhum bloco", () => {
    usuarioFake = { usuario: u([]), carregando: false };
    const { container } = render(<Raiz base={fakeBase([], { semAcesso: true })}><MeuPainel /></Raiz>);
    expect(container.textContent).toContain("Seu login ainda não está ligado a um nome da planilha. Fale com o administrador.");
    expect(container.textContent).not.toContain("A renovar");
  });
  it("com nomes: saudação pelo primeiro nome e cabeçalho do mês", () => {
    usuarioFake = { usuario: u([GV]), carregando: false };
    const { container } = render(<Raiz><MeuPainel /></Raiz>);
    expect(container.textContent).toContain("Olá, Gabriel");
    expect(container.textContent).toContain("Outubro de 2026 · dados até hoje, 22/10");
    expect(container.textContent).toContain("Transportes Rocha");
  });
});
