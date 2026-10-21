// Exportar da aba Cross-sell (Export_CrossSell.xlsx, aba "CrossSell"): a planilha baixada no app novo precisa ser
// igual à do app antigo (nome do arquivo, nome da aba, cabeçalhos, linhas e valores — inclusive o LTV numérico
// sem arredondar), com a mesma fixture, o mesmo relógio e os mesmos controles.
import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import * as XLSX from "xlsx";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { abrirAntigo, injetarDadosAntigo, servirRaiz } from "../../parity/antigo";
import { aquecer, subirServidorNovo, type ServidorNovo } from "../../parity/novo";

let srv: Server, novo: ServidorNovo, dir: string, saida: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "fixture-"));
  saida = mkdtempSync(join(tmpdir(), "export-"));
  gerarFixture(dir);
  srv = await servirRaiz();
  novo = await subirServidorNovo(dir);
});
test.afterAll(() => {
  novo?.parar();
  srv?.close();
  for (const d of [dir, saida]) if (d) rmSync(d, { recursive: true, force: true });
});

type Controles = { pj: boolean; busca: string; limparRamos: boolean; colab: string };
type Baixado = { arquivo: string; abas: string[]; dados: unknown[][][] };

async function baixar(page: Page, clicar: () => Promise<void>, nome: string): Promise<Baixado> {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), clicar()]);
  const alvo = join(saida, nome);
  await dl.saveAs(alvo);
  const wb = XLSX.readFile(alvo);
  return { arquivo: dl.suggestedFilename(), abas: wb.SheetNames, dados: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }) as unknown[][]) };
}

const rotulo = (c: Controles) => `${c.pj ? "pj" : "pf"}-${c.busca || "sem-busca"}-${c.limparRamos ? "todos-ramos" : "ramos-padrao"}-${c.colab ? "colab" : "todos-colab"}`.replace(/\W+/g, "_");

async function exportarAntigo(page: Page, c: Controles) {
  await abrirAntigo(page);
  await injetarDadosAntigo(page, dir);
  await page.evaluate(() => {
    const w = window as unknown as { showTab(a: string, b: Element): void };
    w.showTab("crosssell", document.querySelector(`.tab-btn[onclick*="'crosssell'"]`)!);
  });
  if (c.pj) await page.click('label[for="cp-pj"]');
  if (c.limparRamos) { await page.click("#ms-cross-ram .ms-trigger"); await page.click("#ms-cross-ram .ms-footer button:nth-child(2)"); await page.mouse.click(1, 1); } // Limpar do seletor: todos os ramos
  if (c.colab) {
    await page.click("#ms-cross-col .ms-trigger");
    await page.click(`#ms-cross-col input[type=checkbox][id$="${c.colab.replace(/\W/g, "_")}"]`);
    await page.mouse.click(1, 1);
  }
  if (c.busca) await page.evaluate((v) => {
    const el = document.getElementById("cross-search") as HTMLInputElement;
    el.value = v; el.dispatchEvent(new Event("input", { bubbles: true }));
  }, c.busca);
  return baixar(page, () => page.click(`button[onclick="exportData('crosssell')"]`), `antigo-${rotulo(c)}.xlsx`);
}

async function exportarNovo(page: Page, c: Controles) {
  await page.goto(`${novo.baseUrl}/crosssell`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction("(() => { const t = (document.getElementById('rec-badge')?.textContent ?? '').trim(); return t !== '' && t !== '—'; })()", undefined, { timeout: 120_000 });
  await page.waitForSelector("#cross-kpi-grid .kpi", { timeout: 60_000 });
  if (c.pj) await page.click('label[for="cp-pj"]');
  if (c.limparRamos) { await page.click("#ms-cross-ram .ms-trigger"); await page.click("#ms-cross-ram .ms-footer button:nth-child(2)"); await page.mouse.click(1, 1); }
  if (c.colab) {
    await page.click("#ms-cross-col .ms-trigger");
    await page.click(`#ms-cross-col input[type=checkbox][data-valor="${c.colab}"]`);
    await page.mouse.click(1, 1);
  }
  if (c.busca) await page.fill("#cross-search", c.busca);
  await page.waitForTimeout(300);
  return baixar(page, () => page.click("#sc-cross-table button:has-text('Exportar')"), `novo-${rotulo(c)}.xlsx`);
}

for (const c of [
  { pj: false, busca: "", limparRamos: false, colab: "" },
  { pj: true, busca: "", limparRamos: true, colab: "" },
  { pj: false, busca: "Silva", limparRamos: false, colab: "" },
  { pj: false, busca: "", limparRamos: true, colab: "ANA CLARA MENDES" },
] as Controles[]) {
  test(`Export_CrossSell.xlsx novo == antigo (${rotulo(c)})`, async ({ browser }) => {
    await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["crosssell"]);
    const ca = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const cn = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const pa = await ca.newPage(), pn = await cn.newPage();
    for (const p of [pa, pn]) {
      await p.clock.install({ time: new Date("2026-10-15T12:00:00-03:00") });
      await p.clock.setFixedTime(new Date("2026-10-15T12:00:00-03:00")); // Date.now() parado: o LTV depende do instante exato
    }
    const antigo = await exportarAntigo(pa, c);
    const novoR = await exportarNovo(pn, c);

    expect(antigo.arquivo).toBe("Export_CrossSell.xlsx");
    expect(antigo.abas).toEqual(["CrossSell"]);
    expect(novoR.arquivo).toBe(antigo.arquivo);
    expect(novoR.abas).toEqual(antigo.abas);
    expect(antigo.dados[0].length).toBeGreaterThan(1); // cabeçalho + ao menos um cliente
    expect(antigo.dados[0][0].slice(0, 2)).toEqual(["Nome", "CPF/CNPJ"]);
    expect(antigo.dados[0][0].slice(-2)).toEqual(["Apólices ativas", "LTV"]);
    expect(novoR.dados[0]).toEqual(antigo.dados[0]);
    await ca.close(); await cn.close();
  });
}
