// Exportar da aba Retenção (churn por produtor e detalhe apólice a apólice): as planilhas baixadas no app novo
// precisam ser iguais às do app antigo (nome do arquivo, nome da aba, cabeçalhos, linhas e valores),
// com a mesma fixture e os mesmos controles.
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

type Controles = { grupo: boolean; evitavelOff: boolean; situacao: "" | "canc" | "venc" };
type Baixado = { arquivo: string; abas: string[]; dados: unknown[][][] };

async function baixar(page: Page, clicar: () => Promise<void>, nome: string): Promise<Baixado> {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), clicar()]);
  const alvo = join(saida, nome);
  await dl.saveAs(alvo);
  const wb = XLSX.readFile(alvo);
  return { arquivo: dl.suggestedFilename(), abas: wb.SheetNames, dados: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }) as unknown[][]) };
}

const rotulo = (c: Controles) => `${c.grupo ? "grupo" : "colab"}-${c.evitavelOff ? "todos" : "evitavel"}-${c.situacao || "todas"}`;

async function exportarAntigo(page: Page, c: Controles) {
  await abrirAntigo(page);
  await injetarDadosAntigo(page, dir);
  await page.evaluate(({ grupo, evitavelOff, situacao }) => {
    const w = window as unknown as { showTab(a: string, b: Element): void };
    w.showTab("retencao", document.querySelector(`.tab-btn[onclick*="'retencao'"]`)!);
    if (evitavelOff) (document.getElementById("ret-evitavel-btn") as HTMLElement).click();
    if (grupo) (document.getElementById("vt-ret-grp") as HTMLInputElement).click();
    if (situacao) (document.getElementById(situacao === "canc" ? "ret-filter-canc-btn" : "ret-filter-venc-btn") as HTMLElement).click();
  }, c);
  const churn = await baixar(page, () => page.click(`button[onclick="exportData('churn')"]`), `antigo-churn-${rotulo(c)}.xlsx`);
  const detalhe = await baixar(page, () => page.click(`button[onclick="exportData('detalhe')"]`), `antigo-detalhe-${rotulo(c)}.xlsx`);
  return { churn, detalhe };
}

async function exportarNovo(page: Page, c: Controles) {
  await page.goto(`${novo.baseUrl}/retencao`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction("(() => { const t = (document.getElementById('rec-badge')?.textContent ?? '').trim(); return t !== '' && t !== '—'; })()", undefined, { timeout: 120_000 });
  await page.waitForSelector("#ret-kpi-grid .kpi", { timeout: 60_000 });
  if (c.evitavelOff) await page.click("#ret-evitavel-btn");
  if (c.grupo) await page.click('label[for="vt-ret-grp"]');
  if (c.situacao) await page.click(c.situacao === "canc" ? "#ret-filter-canc-btn" : "#ret-filter-venc-btn");
  await page.waitForTimeout(300);
  const churn = await baixar(page, () => page.click("#sc-ret-prod button:has-text('Exportar')"), `novo-churn-${rotulo(c)}.xlsx`);
  const detalhe = await baixar(page, () => page.click("#sc-ret-detail button:has-text('Exportar')"), `novo-detalhe-${rotulo(c)}.xlsx`);
  return { churn, detalhe };
}

for (const c of [
  { grupo: false, evitavelOff: false, situacao: "" },
  { grupo: true, evitavelOff: true, situacao: "canc" },
  { grupo: false, evitavelOff: true, situacao: "venc" },
] as Controles[]) {
  test(`Export_Churn.xlsx e Export_Detalhe.xlsx novo == antigo (${rotulo(c)})`, async ({ browser }) => {
    await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["retencao"]);
    const ca = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const cn = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const pa = await ca.newPage(), pn = await cn.newPage();
    for (const p of [pa, pn]) await p.clock.install({ time: new Date("2026-10-15T12:00:00-03:00") });
    const antigo = await exportarAntigo(pa, c);
    const novoR = await exportarNovo(pn, c);

    expect(antigo.churn.arquivo).toBe("Export_Churn.xlsx");
    expect(antigo.churn.abas).toEqual(["Churn"]);
    expect(antigo.detalhe.arquivo).toBe("Export_Detalhe.xlsx");
    expect(antigo.detalhe.abas).toEqual(["Detalhe"]);
    expect(novoR.churn.arquivo).toBe(antigo.churn.arquivo);
    expect(novoR.detalhe.arquivo).toBe(antigo.detalhe.arquivo);
    expect(novoR.churn.abas).toEqual(antigo.churn.abas);
    expect(novoR.detalhe.abas).toEqual(antigo.detalhe.abas);
    expect(antigo.churn.dados[0].length).toBeGreaterThan(1);   // cabeçalho + ao menos um produtor
    expect(antigo.detalhe.dados[0].length).toBeGreaterThan(1); // cabeçalho + ao menos uma perdida
    expect(novoR.churn.dados[0]).toEqual(antigo.churn.dados[0]);
    expect(novoR.detalhe.dados[0]).toEqual(antigo.detalhe.dados[0]);
    expect(antigo.churn.dados[0][0]).toHaveLength(17);
    expect(antigo.detalhe.dados[0][0]).toEqual(["Tipo", "Cliente", "Ramo", "Seguradora", "Colaborador", "Situação", "Motivo", "Prêmio", "Comissão", "Vigência", "Saída"]);
    await ca.close(); await cn.close();
  });
}
