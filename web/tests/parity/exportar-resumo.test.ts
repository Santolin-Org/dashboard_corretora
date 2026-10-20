// "Exportar Resumo": a planilha baixada no app novo precisa ser igual à do app antigo
// (nomes e ordem das abas, cabeçalhos, linhas e valores), com a mesma fixture e os mesmos filtros.
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

async function lerBaixado(page: Page, clicar: () => Promise<void>, nome: string) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), clicar()]);
  expect(dl.suggestedFilename()).toBe("Resumo_Executivo.xlsx");
  const alvo = join(saida, nome);
  await dl.saveAs(alvo);
  const wb = XLSX.readFile(alvo);
  return { abas: wb.SheetNames, dados: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true })) };
}

async function exportarAntigo(page: Page, grupo: boolean, vig?: [string, string]) {
  await abrirAntigo(page);
  await injetarDadosAntigo(page, dir);
  await page.evaluate(({ grupo, vig }) => {
    if (vig) {
      for (const [id, v] of [["f-vig-s", vig[0]], ["f-vig-e", vig[1]]] as const) {
        const el = document.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (grupo) (document.getElementById("vt-grp") as HTMLInputElement).click();
  }, { grupo, vig });
  return lerBaixado(page, () => page.click('button[onclick*="exportExecutiveSummary"]'), `antigo-${grupo}-${vig ? "vig" : "tudo"}.xlsx`);
}

async function exportarNovo(page: Page, grupo: boolean, vig?: [string, string]) {
  await page.goto(`${novo.baseUrl}/producao`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction("(() => { const t = (document.getElementById('rec-badge')?.textContent ?? '').trim(); return t !== '' && t !== '—'; })()", undefined, { timeout: 120_000 });
  if (vig) { await page.fill("#f-vig-s", vig[0]); await page.fill("#f-vig-e", vig[1]); }
  if (grupo) await page.click('label[for="vt-grp"]');
  await page.waitForTimeout(300);
  return lerBaixado(page, () => page.click('button:has-text("Exportar Resumo")'), `novo-${grupo}-${vig ? "vig" : "tudo"}.xlsx`);
}

for (const [nome, grupo, vig] of [
  ["sem filtros, por colaborador", false, undefined],
  ["vigência 2026-01-01..2026-09-30, por grupo de produção", true, ["2026-01-01", "2026-09-30"] as [string, string]],
] as const) {
  test(`Resumo_Executivo.xlsx novo == antigo (${nome})`, async ({ browser }) => {
    await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["producao"]);
    const ca = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const cn = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const pa = await ca.newPage(), pn = await cn.newPage();
    for (const p of [pa, pn]) await p.clock.install({ time: new Date("2026-10-15T12:00:00-03:00") });
    const antigo = await exportarAntigo(pa, grupo, vig);
    const novoR = await exportarNovo(pn, grupo, vig);
    expect(antigo.abas).toEqual(["Base_Filtrada", "Producao_Por_Agente"]);
    expect(novoR.abas).toEqual(antigo.abas);
    expect((antigo.dados[0] as unknown[][]).length).toBeGreaterThan(50);
    expect(novoR.dados[0]).toEqual(antigo.dados[0]);
    expect(novoR.dados[1]).toEqual(antigo.dados[1]);
    expect((novoR.dados[1] as unknown[][])[0]).toEqual(["Nome", "Prêmio", "Comissão", "Ticket", "Qtd"]);
    await ca.close(); await cn.close();
  });
}
