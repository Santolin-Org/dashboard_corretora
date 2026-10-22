// Modo apresentação (/apresentacao): abre pelo botão da aba Metas com os filtros (?f=), teclado/dots/Anterior/Próximo,
// Esc volta à aba Metas com os filtros e o PDF tem uma página por slide (html2canvas/jsPDF só carregam no clique).
import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { aquecer, subirServidorNovo, type ServidorNovo } from "../../parity/novo";

let novo: ServidorNovo, dir: string, saida: string;
const F = JSON.stringify({ vigIni: "2026-10-01", vigFim: "2026-10-31" });
const URL_METAS = (base: string) => `${base}/metas?f=${encodeURIComponent(F)}`;

test.beforeAll(async ({ browser }) => {
  dir = mkdtempSync(join(tmpdir(), "fixture-"));
  saida = mkdtempSync(join(tmpdir(), "export-"));
  gerarFixture(dir);
  novo = await subirServidorNovo(dir);
  await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["metas", "apresentacao"]);
});
test.afterAll(async () => {
  await novo?.parar();
  for (const d of [dir, saida]) if (d) rmSync(d, { recursive: true, force: true });
});

async function abrir(p: Page) {
  await p.goto(URL_METAS(novo.baseUrl), { waitUntil: "load", timeout: 120_000 });
  await p.click("#sc-metas-semanal .kickoff-btn", { timeout: 90_000 });
  await p.waitForSelector("#kickoff-mode .kf-choose-main", { timeout: 30_000 });
}
const ponto = (p: Page) => p.evaluate(() => [...document.querySelectorAll("#kf-dots .kf-pgdot")].findIndex((d) => d.classList.contains("on")));
const filtrosDaUrl = (p: Page) => new URL(p.url()).searchParams.get("f");

test("botão abre /apresentacao com ?f=; teclado, dots, Anterior/Próximo e Esc de volta à Metas", async ({ page }) => {
  await abrir(page);
  expect(new URL(page.url()).pathname).toBe("/apresentacao");
  expect(filtrosDaUrl(page)).toBe(F);
  // Na tela de escolha as setas não fazem nada e os controles ficam escondidos.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#kickoff-mode .kf-controls")).toBeHidden();
  await page.click("#kickoff-mode .kf-choose-main");
  await expect(page.locator("#kf-dots .kf-pgdot")).toHaveCount(14);
  expect(await ponto(page)).toBe(0);
  await page.keyboard.press("ArrowLeft"); expect(await ponto(page)).toBe(0); // não passa do primeiro
  await page.keyboard.press("ArrowRight"); expect(await ponto(page)).toBe(1);
  await page.keyboard.press(" "); expect(await ponto(page)).toBe(2);
  await page.keyboard.press("PageDown"); expect(await ponto(page)).toBe(3);
  await page.keyboard.press("PageUp"); expect(await ponto(page)).toBe(2);
  await page.click("#kickoff-mode .kf-controls .kf-nav:nth-child(3)"); expect(await ponto(page)).toBe(3);
  await page.click("#kickoff-mode .kf-controls .kf-nav:nth-child(1)"); expect(await ponto(page)).toBe(2);
  await page.click("#kf-dots .kf-pgdot:nth-child(14)"); expect(await ponto(page)).toBe(13);
  await page.keyboard.press("ArrowRight"); expect(await ponto(page)).toBe(13); // não passa do último
  await expect(page.locator("#kf-stage")).toHaveText("BORA TIME!");
  // Esc sai: volta à aba Metas, com os filtros.
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/metas/);
  expect(filtrosDaUrl(page)).toBe(F);
  await expect(page.locator("#tab-metas")).toBeVisible();
  expect(await page.locator("#f-vig-s").inputValue()).toBe("2026-10-01");
});

test("Sair ✕ volta à Metas; reabrir mostra a tela de escolha de novo", async ({ page }) => {
  await abrir(page);
  await page.click("#kickoff-mode .kf-choose-main");
  await expect(page.locator("#kf-dots .kf-pgdot")).toHaveCount(14);
  await page.click("#kickoff-mode .kf-exit");
  await page.waitForURL(/\/metas/);
  expect(filtrosDaUrl(page)).toBe(F);
  await page.click("#sc-metas-semanal .kickoff-btn");
  await expect(page.locator("#kickoff-mode .kf-choose-main")).toBeVisible();
});

test("PDF: uma página por slide (fechamento = 14, semana = 10); html2canvas/jsPDF só carregam no clique", async ({ browser }) => {
  const cx = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
  const p = await cx.newPage();
  const scripts: string[] = [];
  p.on("request", (r) => { if (r.resourceType() === "script") scripts.push(r.url()); });
  await abrir(p);
  await p.click("#kickoff-mode .kf-choose-main");
  await expect(p.locator("#kf-dots .kf-pgdot")).toHaveCount(14);
  await p.waitForTimeout(500);
  const biblioteca = async (nome: "html2canvas" | "jspdf") => {
    let achou = false;
    for (const u of scripts) {
      if (!u.includes("/_next/")) continue;
      const corpo = await (await p.request.get(u)).text();
      if (nome === "html2canvas" ? corpo.includes("Unable to find element in cloned iframe") : (corpo.match(/jsPDF/g) ?? []).length > 30) achou = true;
    }
    return achou;
  };
  expect(await biblioteca("html2canvas")).toBe(false);
  expect(await biblioteca("jspdf")).toBe(false);
  await p.click("#kickoff-mode .kf-controls .kf-nav:nth-child(3)"); // o PDF sai completo e o slide volta ao atual
  const paginas = async (nome: string) => {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180_000 }), p.click("#kf-pdf-btn")]);
    const alvo = join(saida, nome);
    await dl.saveAs(alvo);
    const pdf = readFileSync(alvo).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    return { arquivo: dl.suggestedFilename(), n: (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length };
  };
  const a = await paginas("fechamento.pdf");
  expect(a.arquivo).toBe("kickoff-outubro-2026.pdf");
  expect(a.n).toBe(14);
  expect(await biblioteca("html2canvas")).toBe(true);
  expect(await biblioteca("jspdf")).toBe(true);
  await expect(p.locator("#kf-pdf-btn")).toHaveText("↓ Exportar PDF");
  expect(await ponto(p)).toBe(1); // voltou ao slide em que estava
  // Semana: 10 slides.
  await p.evaluate(() => (document.querySelector("#kickoff-mode .kf-back") as HTMLElement).click()); // "↩ Opções" (escondido pelo CSS do antigo; ver divergencias.md)
  await p.click("#kickoff-mode .kf-wk-grid .kf-wk-btn:nth-child(2)");
  await expect(p.locator("#kf-dots .kf-pgdot")).toHaveCount(10);
  expect((await paginas("semana.pdf")).n).toBe(10);
  await cx.close();
});
