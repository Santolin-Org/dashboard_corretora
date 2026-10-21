// Exportar do pivô do Comparativo: .xlsx novo == antigo (arquivo, aba, cabeçalho e linhas, com a visão marcada e grupos
// recolhidos) e PDF (Comparativo_Seguradora_Ramo.pdf) com mais de 0 páginas, com html2canvas/jsPDF carregados só no clique.
import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

async function baixar(page: Page, clicar: () => Promise<void>, nome: string) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), clicar()]);
  const alvo = join(saida, nome);
  await dl.saveAs(alvo);
  return { arquivo: dl.suggestedFilename(), alvo };
}
const lerXlsx = (alvo: string) => {
  const wb = XLSX.readFile(alvo);
  return { abas: wb.SheetNames, dados: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }) as unknown[][]) };
};

const CONTROLES = [
  { rotulo: "ambos", visao: "", recolher: false },
  { rotulo: "ramo", visao: "r", recolher: false },
  { rotulo: "seg", visao: "s", recolher: false },
  { rotulo: "ambos-recolhido", visao: "", recolher: true },
];
for (const c of CONTROLES) {
  test(`Comparativo_*.xlsx novo == antigo (${c.rotulo})`, async ({ browser }) => {
    await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["comparativo"]);
    const ca = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const cn = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
    const pa = await ca.newPage(), pn = await cn.newPage();
    for (const p of [pa, pn]) await p.clock.install({ time: new Date("2026-10-15T12:00:00-03:00") });

    await abrirAntigo(pa);
    await injetarDadosAntigo(pa, dir);
    await pa.evaluate(() => {
      const w = window as unknown as { showTab(a: string, b: Element): void };
      w.showTab("comparativo", document.querySelector(`.tab-btn[onclick*="'comparativo'"]`)!);
    });
    await pn.goto(`${novo.baseUrl}/comparativo`, { waitUntil: "load", timeout: 120_000 });
    await pn.waitForSelector("#comp-pivot-table", { timeout: 90_000 });
    for (const p of [pa, pn]) {
      if (c.visao) await p.click(`label[for="vw-comp-pivot-${c.visao}"]`);
      if (c.recolher) await p.click("#comp-pivot-bulk button:nth-child(1)");
    }
    const a = await baixar(pa, async () => { await pa.click("#sc-comp-pivot button:has-text('Exportar')"); await pa.click("button[onclick=\"exportCompPivotAs('xlsx')\"]"); }, "antigo.xlsx");
    const n = await baixar(pn, async () => { await pn.click("#sc-comp-pivot button:has-text('Exportar')"); await pn.click("button:has-text('Excel (.xlsx)')"); }, "novo.xlsx");
    expect(n.arquivo).toBe(a.arquivo);
    const xa = lerXlsx(a.alvo), xn = lerXlsx(n.alvo);
    expect(xa.abas).toEqual(["Comparativo"]);
    expect(xn.abas).toEqual(xa.abas);
    expect(xa.dados[0].length).toBeGreaterThan(1);
    expect(xn.dados[0]).toEqual(xa.dados[0]);
    await ca.close(); await cn.close();
  });
}

test("PDF do pivô: >0 páginas e html2canvas/jsPDF só carregam no clique", async ({ browser }) => {
  await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["comparativo"]);
  const cx = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
  const p = await cx.newPage();
  const scripts: string[] = [];
  p.on("request", (r) => { if (r.resourceType() === "script") scripts.push(r.url()); });
  await p.goto(`${novo.baseUrl}/comparativo`, { waitUntil: "load", timeout: 120_000 });
  await p.waitForSelector("#comp-pivot-table", { timeout: 90_000 });
  await p.waitForTimeout(500);
  const biblioteca = async (nome: "html2canvas" | "jspdf") => {
    let achou = false;
    for (const u of scripts) {
      if (!u.includes("/_next/")) continue;
      const corpo = await (await p.request.get(u)).text();
      // o código do próprio app cita os nomes poucas vezes; as bibliotecas têm marcas internas próprias
      if (nome === "html2canvas" ? corpo.includes("Unable to find element in cloned iframe") : (corpo.match(/jsPDF/g) ?? []).length > 30) achou = true;
    }
    return achou;
  };
  expect(await biblioteca("html2canvas")).toBe(false);
  expect(await biblioteca("jspdf")).toBe(false);
  const r = await baixar(p, async () => { await p.click("#sc-comp-pivot button:has-text('Exportar')"); await p.click("button:has-text('PDF')"); }, "novo.pdf");
  expect(r.arquivo).toBe("Comparativo_Seguradora_Ramo.pdf");
  expect(await biblioteca("html2canvas")).toBe(true); // o detector funciona: depois do clique os chunks das bibliotecas foram pedidos
  expect(await biblioteca("jspdf")).toBe(true);
  const pdf = readFileSync(r.alvo).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(0);
  await cx.close();
});
