// Exportar da aba Metas (Metas_Equipe.xlsx e Metas_Colaboradores.xlsx): as planilhas baixadas no app novo precisam ser
// iguais às do app antigo (nome do arquivo, nome da aba, cabeçalho e todas as linhas), com os % de meta padrão e alterados.
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
  { rotulo: "padrao", novos: "", renov: "" },
  { rotulo: "pct-25-5", novos: "25", renov: "5" },
];
const EXPORTAR = [
  { rotulo: "equipe", arquivo: "Metas_Equipe.xlsx", aba: "Metas_Equipe", antigo: "#tab-metas .metas-team-header button", novo: "#tab-metas .metas-team-header button" },
  { rotulo: "colab", arquivo: "Metas_Colaboradores.xlsx", aba: "Metas_Colaboradores", antigo: "#sc-metas-colab button:has-text('Exportar')", novo: "#sc-metas-colab button:has-text('Exportar')" },
];
for (const c of CONTROLES) {
  for (const x of EXPORTAR) {
    test(`${x.arquivo} novo == antigo (${c.rotulo})`, async ({ browser }) => {
      await aquecer(await (await browser.newContext()).newPage(), novo.baseUrl, ["metas"]);
      const ca = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
      const cn = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR", acceptDownloads: true });
      const pa = await ca.newPage(), pn = await cn.newPage();
      for (const p of [pa, pn]) await p.clock.install({ time: new Date("2026-10-15T12:00:00-03:00") });

      await abrirAntigo(pa);
      await injetarDadosAntigo(pa, dir);
      await pa.evaluate(() => {
        const w = window as unknown as { showTab(a: string, b: Element): void };
        w.showTab("metas", document.querySelector(`.tab-btn[onclick*="'metas'"]`)!);
      });
      await pn.goto(`${novo.baseUrl}/metas`, { waitUntil: "load", timeout: 120_000 });
      await pn.waitForSelector("#metas-colab-wrap table", { timeout: 90_000 });
      for (const p of [pa, pn]) {
        if (c.novos) await p.fill("#meta-novos-pct", c.novos);
        if (c.renov) await p.fill("#meta-renov-pct", c.renov);
      }
      const a = await baixar(pa, () => pa.click(x.antigo), "antigo.xlsx");
      const n = await baixar(pn, () => pn.click(x.novo), "novo.xlsx");
      expect(a.arquivo).toBe(x.arquivo);
      expect(n.arquivo).toBe(a.arquivo);
      const xa = lerXlsx(a.alvo), xn = lerXlsx(n.alvo);
      expect(xa.abas).toEqual([x.aba]);
      expect(xn.abas).toEqual(xa.abas);
      expect(xa.dados[0].length).toBeGreaterThan(1);
      expect(xn.dados[0]).toEqual(xa.dados[0]);
      await ca.close(); await cn.close();
    });
  }
}
