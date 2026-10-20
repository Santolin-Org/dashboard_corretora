/* eslint-disable @typescript-eslint/no-explicit-any */
// Lado ANTIGO do harness: carrega o index.html do repositório num navegador, injeta as
// planilhas exatamente como _spFetchAndLoad faz (sem login) e tira o snapshot.
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import type { Page } from "@playwright/test";
import { HOJE_FIXO, type Cenario } from "./cenarios";
import type { Snapshot } from "./snapshot";

declare const charts: Record<string, any>; // global do app antigo; só existe dentro de page.evaluate

export const PORTA_ANTIGO = 5599;
export const RAIZ_REPO = resolve(__dirname, "..", "..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

/** Servidor estático da raiz do repositório (somente leitura). */
export function servirRaiz(porta = PORTA_ANTIGO): Promise<Server> {
  const srv = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const alvo = resolve(RAIZ_REPO, "." + (url === "/" ? "/index.html" : url));
    if (!alvo.startsWith(RAIZ_REPO) || !existsSync(alvo) || !statSync(alvo).isFile()) {
      res.statusCode = 404; res.end("not found"); return;
    }
    res.setHeader("Content-Type", MIME[extname(alvo)] ?? "application/octet-stream");
    res.end(readFileSync(alvo));
  });
  return new Promise((ok, erro) => { srv.once("error", erro); srv.listen(porta, "127.0.0.1", () => ok(srv)); });
}

const normNome = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ehProducao = (n: string) => /^producao.*\.xlsx?$/.test(normNome(n)) && !n.startsWith("~$");
const LAST_MODIFIED = "Wed, 14 Oct 2026 12:00:00 GMT";

function lerDados(dir: string) {
  const nomes = readdirSync(dir);
  const b64 = (n: string) => readFileSync(join(dir, n)).toString("base64");
  return {
    producao: nomes.filter(ehProducao).sort().map((name) => ({ name, b64: b64(name) })),
    sinistrosAvisados: nomes.includes("sinistrosAvisados.xlsx") ? b64("sinistrosAvisados.xlsx") : null,
    sinistrosPagamentos: nomes.includes("sinistrosPagamentos.xlsx") ? b64("sinistrosPagamentos.xlsx") : null,
    saude: nomes.includes("saude_fernando.xlsx") ? b64("saude_fernando.xlsx") : null,
    lastModified: LAST_MODIFIED,
  };
}

export async function snapshotAntigo(page: Page, dataDir: string, c: Cenario): Promise<Snapshot> {
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("dialog", (d) => { erros.push(`dialog: ${d.message()}`); void d.dismiss(); });

  // tsx/esbuild injeta __name() nas funções serializadas para page.evaluate.
  await page.addInitScript("window.__name = (f) => f;");
  await page.clock.install({ time: new Date(HOJE_FIXO) });
  await page.goto(`http://127.0.0.1:${PORTA_ANTIGO}/index.html`, { waitUntil: "load" });
  await page.waitForFunction("typeof XLSX !== 'undefined' && typeof Chart !== 'undefined'", undefined, { timeout: 60000 });

  // Mesma montagem de payloads de _spFetchAndLoad (modo 'prod').
  await page.evaluate((d) => {
    const dec = (b: string) => {
      const bin = atob(b); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    };
    const w = window as any;
    const payloads: any = {};
    payloads.producao = d.producao.map((f: any) => ({
      name: f.name, rows: w.parseProducaoArrayBuffer(dec(f.b64)), lastModified: d.lastModified, cached: false,
    }));
    if (d.sinistrosAvisados) payloads.sinistrosAvisados = dec(d.sinistrosAvisados);
    if (d.sinistrosPagamentos) payloads.sinistrosPagamentos = dec(d.sinistrosPagamentos);
    if (d.saude) payloads.saude = { buf: dec(d.saude), lastModified: d.lastModified };
    document.getElementById("landing-screen")!.style.display = "none";
    w.applySharePointData(payloads, []);
  }, lerDados(dataDir));
  await page.waitForFunction("document.getElementById('dash') && document.getElementById('dash').style.display !== 'none'");

  const abaTab = c.aba === "exibicao-tv" || c.aba === "apresentacao" ? "visao-geral" : c.aba;
  await page.evaluate((aba) => {
    const w = window as any;
    const btn = document.querySelector(`.tab-btn[onclick*="'${aba}'"]`);
    if (!btn) throw new Error(`botão da aba ${aba} não encontrado`);
    w.showTab(aba, btn);
  }, abaTab);

  for (const p of c.passos) {
    if (p.tipo === "preencher") {
      await page.evaluate(({ id, valor }) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) throw new Error(`#${id} não existe`);
        el.value = valor;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, p);
    } else if (p.tipo === "clicar") {
      await page.click(p.seletor, { timeout: 10000 });
    } else {
      await page.evaluate(({ id, valores }) => {
        const wrap = document.getElementById(id) as any;
        if (!wrap || !wrap._msObj) throw new Error(`#${id} não é um multiselect montado`);
        const w = window as any;
        for (const v of valores) {
          if (!wrap._vals.includes(v)) throw new Error(`valor "${v}" não existe em #${id}`);
          wrap._msObj[wrap._key].add(v);
        }
        w.renderMsListGeneric(wrap._list, wrap._vals, wrap._msObj, wrap._key);
        w.updateMsTriggerGeneric(wrap, wrap._msObj, wrap._key, wrap._placeholder);
        w.triggerFilter(wrap._cid);
      }, p);
    }
    await page.waitForTimeout(150);
  }

  let container = `#tab-${c.aba}`;
  if (c.aba === "exibicao-tv") {
    await page.evaluate(() => (window as any).openTvExibicao());
    container = "#tv-exibicao";
  } else if (c.aba === "apresentacao") {
    await page.evaluate(() => (window as any).openKickoff());
    // Baralho padrão: "Fechamento de mês"; o primeiro slide é o snapshot.
    await page.click("#kickoff-mode .kf-choose-main", { timeout: 10000 });
    container = "#kickoff-mode";
  }
  await page.waitForTimeout(600);

  // `charts` é um `const` global do app antigo (escopo léxico global, fora de window).
  const snap = await page.evaluate((container) => {
    const colapsar = (s: string) => s.replace(/\s+/g, " ").trim();
    const textos: Record<string, string> = {};
    const coleta = (el: Element) => { if (el.id && !(el.id in textos)) textos[el.id] = colapsar(el.textContent ?? ""); };
    const raiz = document.querySelector(container);
    if (!raiz) throw new Error(`contêiner ${container} não existe`);
    coleta(raiz);
    raiz.querySelectorAll("[id]").forEach(coleta);
    for (const id of ["dash-subtitle", "rec-badge"]) { const e = document.getElementById(id); if (e) coleta(e); }

    const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
    const graficos: Snapshot["graficos"] = {};
    for (const id of Object.keys(charts)) {
      const cv = document.getElementById(id);
      if (!cv || !raiz.contains(cv)) continue;
      const ch = charts[id];
      graficos[id] = {
        labels: (ch.data.labels ?? []).map((l: unknown) => String(l)),
        datasets: ch.data.datasets.map((d: any) => ({
          ...(d.label !== undefined ? { label: String(d.label) } : {}),
          data: (d.data ?? []).map(num),
        })),
      };
    }
    return { textos, graficos } as Snapshot;
  }, container);

  if (erros.length) throw new Error(`erros na página antiga (${c.nome}):\n${erros.join("\n")}`);
  return snap;
}
