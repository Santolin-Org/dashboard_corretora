// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { ChartConfiguration } from "chart.js";
import { linha } from "../domain/helpers";
import type { BaseCliente } from "@/client/useBase";
import type { ManifestoFonte } from "@/domain/producao/base";

// next/navigation fora do App Router
let busca = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => busca,
  usePathname: () => "/visao-geral",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// Chart.js não desenha em jsdom: um dublê que guarda a config.
const criados: { cfg: ChartConfiguration; destruido: boolean }[] = [];
vi.mock("chart.js/auto", () => ({
  default: class {
    rec: { cfg: ChartConfiguration; destruido: boolean };
    constructor(_c: unknown, cfg: ChartConfiguration) { this.rec = { cfg, destruido: false }; criados.push(this.rec); }
    destroy() { this.rec.destruido = true; }
  },
}));

import { MultiSelect } from "@/components/MultiSelect";
import { FiltrosGlobais } from "@/components/FiltrosGlobais";
import { FiltrosProvider, useFiltros, codificarFiltros, decodificarFiltros } from "@/client/filtros";
import { Grafico } from "@/components/Grafico";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { BotaoModoTv, ModoTvEfeito } from "@/components/ModoTv";
import { Subtitulo, textoRecBadge } from "@/components/Cabecalho";
import { FILTROS_VAZIOS } from "@/domain/filtros";

beforeEach(() => { busca = new URLSearchParams(); window.history.replaceState(null, "", "/visao-geral"); });
afterEach(() => { cleanup(); localStorage.clear(); document.body.className = ""; });

describe("MultiSelect", () => {
  it("opções com data-valor; clicar marca na ordem; gatilho mostra o primeiro e +N", () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <MultiSelect id="ms-col" chave="col" valores={["ANA", "BIA", "CAU"]} selecionados={[]} placeholder="Todos" onChange={onChange} />,
    );
    expect(container.querySelector("#ms-col .ms-trigger-text.placeholder")!.textContent).toBe("Todos");
    const bia = container.querySelector<HTMLInputElement>('#ms-col input[data-valor="BIA"]')!;
    expect(bia.id).toBe("ms-col-BIA");
    bia.click();
    expect(onChange).toHaveBeenLastCalledWith(["BIA"]);
    rerender(<MultiSelect id="ms-col" chave="col" valores={["ANA", "BIA", "CAU"]} selecionados={["BIA", "ANA"]} placeholder="Todos" onChange={onChange} />);
    expect(container.querySelector("#ms-col .ms-trigger-text")!.textContent).toBe("BIA");
    expect(container.querySelector("#ms-col .ms-badge")!.textContent).toBe("+1");
    fireEvent.click(screen.getByText("Marcar todos"));
    expect(onChange).toHaveBeenLastCalledWith(["BIA", "ANA", "CAU"]);
    container.querySelector<HTMLInputElement>('#ms-col input[data-valor="BIA"]')!.click();
    expect(onChange).toHaveBeenLastCalledWith(["ANA"]);
  });
  it("abre/fecha pelo gatilho e a busca filtra a lista", () => {
    const { container } = render(
      <MultiSelect id="ms-seg" chave="seg" valores={["Allianz", "Porto Seguro"]} selecionados={[]} placeholder="Todas" onChange={() => {}} />,
    );
    const dd = container.querySelector("#ms-seg .ms-dropdown")!;
    expect(dd.classList.contains("open")).toBe(false);
    fireEvent.click(container.querySelector("#ms-seg .ms-trigger")!);
    expect(dd.classList.contains("open")).toBe(true);
    fireEvent.change(container.querySelector("#ms-seg .ms-search")!, { target: { value: "porto" } });
    expect([...container.querySelectorAll("#ms-seg input[data-valor]")].map((e) => e.getAttribute("data-valor"))).toEqual(["Porto Seguro"]);
    fireEvent.click(document.body);
    expect(dd.classList.contains("open")).toBe(false);
  });
});

const LINHAS = [
  linha({ colab: "ANA", tipo: "N", vig: "2026-02-01", em: "2026-01-20", ramo: "Vida", seg: "Allianz", grp: "G1" }),
  linha({ colab: "BIA", tipo: "R", vig: "2025-02-01", em: "2025-01-20", ramo: "Auto", seg: "Porto", grp: "G2" }),
  linha({ colab: "CAU", tipo: "EN", vig: "2026-03-01", em: "2026-02-20", ramo: "Saúde", seg: "Porto", grp: "G1", saudeFaturaDe: "N" }),
];
function Sonda() {
  const { fd, inicial, recBadgeContagem } = useFiltros();
  return <span id="sonda">{`${fd.length}|${inicial}|${recBadgeContagem}`}</span>;
}
const montarFiltros = () => render(<FiltrosProvider linhas={LINHAS}><FiltrosGlobais temProducao /><Sonda /></FiltrosProvider>);
const sonda = () => document.getElementById("sonda")!.textContent;

describe("FiltrosGlobais + useFiltros", () => {
  it("carga inicial: FD = ALL (inclui fatura de saúde) e #rec-badge com 0", () => {
    montarFiltros();
    expect(sonda()).toBe("3|true|0");
  });
  it("data alterada por programa + evento 'change' (como o harness) filtra", () => {
    const { container } = montarFiltros();
    const el = container.querySelector<HTMLInputElement>("#f-vig-s")!;
    act(() => { el.value = "2026-01-01"; el.dispatchEvent(new Event("change", { bubbles: true })); });
    // CAU é fatura de saúde: sem filtro de tipo não conta
    expect(sonda()).toBe("1|false|1");
    expect(new URL(window.location.href).searchParams.get("f")).toBe('{"vigIni":"2026-01-01"}');
  });
  it("evento 'input' também filtra", () => {
    const { container } = montarFiltros();
    const el = container.querySelector<HTMLInputElement>("#f-em-e")!;
    act(() => { el.value = "2025-12-31"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(sonda()).toBe("1|false|1");
  });
  it("botões de tipo: data-tipo, rótulo e classe active", () => {
    const { container } = montarFiltros();
    const n = container.querySelector<HTMLButtonElement>('#tipo-btns .tipo-btn[data-tipo="N"]')!;
    expect(n.textContent).toBe("N — Negócio novo");
    expect([...container.querySelectorAll("#tipo-btns .tipo-btn")].map((b) => b.getAttribute("data-tipo"))).toEqual(["EN", "N", "R"]);
    act(() => n.click());
    expect(n.classList.contains("active")).toBe(true);
    expect(sonda()).toBe("1|false|1");
    act(() => container.querySelector<HTMLButtonElement>('#tipo-btns .tipo-btn[data-tipo="EN"]')!.click());
    expect(sonda()).toBe("1|false|1"); // fatura de N não conta com N marcado
  });
  it("multiselect global filtra pelo data-valor", () => {
    const { container } = montarFiltros();
    act(() => container.querySelector<HTMLInputElement>('#ms-seg input[data-valor="Porto"]')!.click());
    expect(sonda()).toBe("1|false|1");
  });
  it("Limpar filtros: FD = ALL, inputs vazios, badge com a contagem", () => {
    const { container } = montarFiltros();
    const el = container.querySelector<HTMLInputElement>("#f-vig-s")!;
    act(() => { el.value = "2026-01-01"; el.dispatchEvent(new Event("change", { bubbles: true })); });
    act(() => screen.getByText("↻ Limpar filtros").click());
    expect(el.value).toBe("");
    expect(sonda()).toBe("3|false|3");
    expect(new URL(window.location.href).searchParams.has("f")).toBe(false);
  });
  it("lê os filtros de ?f= ao montar", () => {
    busca = new URLSearchParams({ f: codificarFiltros({ ...FILTROS_VAZIOS, col: ["BIA"] }) });
    const { container } = montarFiltros();
    expect(sonda()).toBe("1|false|1");
    expect(container.querySelector("#ms-col .ms-trigger-text")!.textContent).toBe("BIA");
  });
  it("decodificarFiltros ignora lixo", () => {
    expect(decodificarFiltros("{x")).toBeNull();
    expect(decodificarFiltros('{"vigIni":"ontem","col":[1,"A"]}')).toEqual({ ...FILTROS_VAZIOS, col: ["A"] });
  });
});

// matchMedia controlável para alternar prefers-color-scheme.
function mockTema(escuroInicial: boolean) {
  const ouvintes = new Set<() => void>();
  const mq = { matches: escuroInicial, addEventListener: (_: string, f: () => void) => ouvintes.add(f), removeEventListener: (_: string, f: () => void) => ouvintes.delete(f) };
  vi.stubGlobal("matchMedia", () => mq);
  window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
  return { trocar(escuro: boolean) { mq.matches = escuro; ouvintes.forEach((f) => f()); } };
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("Grafico", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete (window as { matchMedia?: unknown }).matchMedia; });

  it("registra window.__charts[id] = { data }, atualiza e remove ao desmontar", async () => {
    mockTema(true);
    const c1 = (): ChartConfiguration => ({ type: "bar", data: { labels: ["Jan"], datasets: [{ label: "2026", data: [1] }] } });
    const c2 = (): ChartConfiguration => ({ type: "bar", data: { labels: ["Jan", "Fev"], datasets: [{ label: "2026", data: [1, 2] }] } });
    const { rerender, unmount, container } = render(<Grafico id="ch-x" construir={c1} altura={210} />);
    expect(container.querySelector(".cw > canvas#ch-x")).not.toBeNull();
    expect((container.querySelector(".cw") as HTMLElement).style.height).toBe("210px");
    expect(window.__charts!["ch-x"].data.labels).toEqual(["Jan"]);
    await tick();
    const primeiro = criados.at(-1)!;
    expect(primeiro.cfg.data).toBe(window.__charts!["ch-x"].data);
    rerender(<Grafico id="ch-x" construir={c2} altura={210} />);
    expect(window.__charts!["ch-x"].data.labels).toEqual(["Jan", "Fev"]);
    await tick();
    expect(primeiro.destruido).toBe(true);
    unmount();
    expect(window.__charts!["ch-x"]).toBeUndefined();
  });

  it("troca de tema: reconstrói a config com as cores novas num Chart novo", async () => {
    const tema = mockTema(true);
    const { axisClr } = await import("@/client/tema");
    const construir = (escuro: boolean): ChartConfiguration => ({
      type: "line", data: { labels: ["Jan"], datasets: [{ data: [1] }] },
      options: { scales: { x: { ticks: { color: axisClr() } } }, plugins: { title: { text: escuro ? "escuro" : "claro" } } },
    });
    render(<Grafico id="ch-tema" construir={construir} />);
    await tick();
    const antes = criados.at(-1)!;
    expect((antes.cfg.options as { scales: { x: { ticks: { color: string } } } }).scales.x.ticks.color).toBe("#8b949e");
    act(() => tema.trocar(false));
    await tick();
    const depois = criados.at(-1)!;
    expect(depois).not.toBe(antes);
    expect(antes.destruido).toBe(true);
    expect(depois.cfg).not.toBe(antes.cfg);
    expect((depois.cfg.options as { scales: { x: { ticks: { color: string } } } }).scales.x.ticks.color).toBe("#888");
    expect((depois.cfg.options as { plugins: { title: { text: string } } }).plugins.title.text).toBe("claro");
    expect(window.__charts!["ch-tema"].data).toBe(depois.cfg.data);
  });
});

describe("SecaoRecolhivel", () => {
  it("o cabeçalho alterna; o botão −/+ não (stopPropagation do index.html); estado sobrevive à remontagem", () => {
    const el = () => (
      <SecaoRecolhivel chave="kpis" cabecalho={<SecaoTitulo>Indicadores principais</SecaoTitulo>}><p>corpo</p></SecaoRecolhivel>
    );
    const { container, unmount } = render(el());
    const cb = container.querySelector("#cb-kpis")!;
    expect(cb.textContent).toBe("−");
    fireEvent.click(cb);
    expect(cb.textContent).toBe("−");
    fireEvent.click(container.querySelector("#sc-kpis .section-header")!);
    expect(cb.textContent).toBe("+");
    expect((container.querySelector("#sb-kpis") as HTMLElement).style.display).toBe("none");
    unmount();
    const r2 = render(el());
    expect(r2.container.querySelector("#cb-kpis")!.textContent).toBe("+");
    fireEvent.click(r2.container.querySelector("#sc-kpis .section-header")!);
    expect(r2.container.querySelector("#cb-kpis")!.textContent).toBe("−");
  });
});

describe("Modo TV", () => {
  it("lê localStorage['tvMode'], alterna a classe do body e o texto do botão", () => {
    localStorage.setItem("tvMode", "1");
    render(<><ModoTvEfeito /><BotaoModoTv /></>);
    const btn = document.getElementById("tv-mode-btn")!;
    expect(document.body.classList.contains("tv-mode")).toBe(true);
    expect(btn.textContent).toBe("📺 Sair do modo TV");
    act(() => btn.click());
    expect(document.body.classList.contains("tv-mode")).toBe(false);
    expect(localStorage.getItem("tvMode")).toBe("0");
    expect(btn.textContent).toBe("📺 Modo TV");
  });
});

describe("Cabeçalho (updateDashHeader)", () => {
  const man = (nome: string, ativasVencidas = 0): ManifestoFonte => ({
    nome, total: 1, duplicadas: 0, anos: null, ativasVencidas, modificadoEm: "", anosIgnorados: [], sobreposicoes: [],
  });
  const base = (o: Partial<BaseCliente>): BaseCliente => ({
    versao: "v", geradoEm: "", hoje: "2026-10-15", linhas: [], sinistros: [], manifesto: [], avisosSaude: [],
    contagensSinistros: { sinistrosAvisados: 0, sinistrosPagamentos: 0 }, avisos: [], ...o,
  });
  const texto = (b: BaseCliente) => {
    const { container } = render(<p id="dash-subtitle"><Subtitulo base={b} onAbrirFontes={() => {}} /></p>);
    const t = container.querySelector("#dash-subtitle")!.textContent;
    cleanup();
    return t;
  };
  it("textos de #dash-subtitle iguais aos do app antigo", () => {
    const sin = Array.from({ length: 1234 }, () => ({}) as BaseCliente["sinistros"][number]);
    expect(texto(base({
      linhas: LINHAS, manifesto: [man("a.xlsx"), man("b.xlsx"), man("saude_fernando.xlsx")], sinistros: sin,
      contagensSinistros: { sinistrosAvisados: 40, sinistrosPagamentos: 25 },
    }))).toBe("Produção: 3 (3 arquivos) · Sinistros: 1.234 (avisados 40 · pagos 25)");
    expect(texto(base({ linhas: LINHAS, manifesto: [man("a.xlsx", 20)] }))).toBe("Produção: 3 (1 arquivo ⚠️)");
    expect(texto(base({}))).toBe("Nenhuma fonte carregada");
  });
  it("#rec-badge: 0 registros na carga, contagem depois; só sinistros mostra 'N sinistros'", () => {
    const b = base({ linhas: LINHAS });
    expect(textoRecBadge(b, 0, true)).toBe("0 registros");
    expect(textoRecBadge(b, 1234, false)).toBe("1.234 registros");
    const s = base({ sinistros: [{}, {}] as BaseCliente["sinistros"] });
    expect(textoRecBadge(s, 0, true)).toBe("2 sinistros");
    expect(textoRecBadge(base({}), 0, true)).toBe("—");
  });
});
