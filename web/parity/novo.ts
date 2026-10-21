/* eslint-disable @typescript-eslint/no-explicit-any */
// Lado NOVO do harness: abre a rota do app Next (next dev com bypass de autenticação), aplica os
// mesmos passos pelos mesmos ids do lado antigo e lê textos de [id] e window.__charts.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { HOJE_FIXO, type Cenario, type Passo } from "./cenarios";
import type { Snapshot } from "./snapshot";

export const RAIZ_WEB = resolve(__dirname, "..");
/** Constante (não parâmetro): o rmSync abaixo nunca pode apontar para fora de web/. */
const DIST_PARIDADE = ".next-parity";

/** Contêiner de captura de cada cenário (espelha o id do app antigo). */
export function conteinerDe(c: Cenario): string {
  return c.aba === "exibicao-tv" ? "#tv-exibicao" : c.aba === "apresentacao" ? "#kickoff-mode" : `#tab-${c.aba}`;
}

async function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once("error", erro);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
}

/** `parar()` devolve uma promessa que só resolve quando o grupo de processos do `next dev` morreu (o próximo servidor reusa o mesmo distDir). */
export type ServidorNovo = { baseUrl: string; parar(): Promise<void> };

/**
 * Sobe `next dev` (não `next start`: o bypass de autenticação recusa NODE_ENV=production de propósito).
 * Usa um distDir próprio (.next-parity) e porta livre, para não colidir com o dev server do desenvolvedor.
 */
export async function subirServidorNovo(dataDir: string): Promise<ServidorNovo> {
  // distDir sempre limpo: o cache persistente do Turbopack deixado por um servidor anterior (morto, às vezes no meio da gravação,
  // ou que carregou html2canvas/jsPDF) faz o servidor seguinte travar o carregamento ou recarregar a página em laço.
  rmSync(join(RAIZ_WEB, DIST_PARIDADE), { recursive: true, force: true });
  const porta = await portaLivre();
  const baseUrl = `http://127.0.0.1:${porta}`;
  const logPath = join(tmpdir(), `parity-next-${porta}.log`);
  const fd = openSync(logPath, "w");
  const filho: ChildProcess = spawn(join(RAIZ_WEB, "node_modules", ".bin", "next"), ["dev", "-p", String(porta), "-H", "127.0.0.1"], {
    cwd: RAIZ_WEB,
    detached: true, // grupo próprio: o kill derruba também os processos filhos do next
    stdio: ["ignore", fd, fd],
    env: {
      ...process.env,
      NODE_ENV: "development",
      TZ: "America/Sao_Paulo",
      FONTE: "local",
      FONTE_DIR: dataDir,
      PARITY_AUTH_BYPASS: "1",
      PARITY_HOJE: "2026-10-15",
      AUTH_SECRET: randomBytes(24).toString("hex"),
      NEXT_DIST_DIR: DIST_PARIDADE,
      NEXT_TSCONFIG: "tsconfig.parity.json",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  closeSync(fd);
  let saiu = false;
  filho.once("exit", () => { saiu = true; });
  const sinais = ["SIGINT", "SIGTERM"] as const;
  const aoSinal = (sig: NodeJS.Signals) => { void parar(); process.exit(sig === "SIGINT" ? 130 : 143); };
  const aoSair = () => { void parar(); };
  let parada: Promise<void> | undefined;
  const grupoVivo = (pid: number) => { try { process.kill(-pid, 0); return true; } catch { return false; } };
  function parar(): Promise<void> {
    for (const sg of sinais) process.removeListener(sg, aoSinal);
    process.removeListener("exit", aoSair);
    if (parada) return parada;
    const pid = filho.pid;
    if (!pid) return (parada = Promise.resolve());
    try { process.kill(-pid, "SIGTERM"); } catch { /* já saiu */ }
    // Um dev server que acabou de compilar muito leva alguns segundos para gravar o cache; matar no meio estraga o
    // distDir (.next-parity) do próximo servidor (recarrega a página em laço). Espera o grupo morrer (SIGKILL só em 20s).
    return (parada = (async () => {
      const limite = Date.now() + 20_000;
      while (grupoVivo(pid) && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
      if (grupoVivo(pid)) { try { process.kill(-pid, "SIGKILL"); } catch { /* já saiu */ } }
    })());
  }
  for (const sg of sinais) process.once(sg, aoSinal);
  process.once("exit", aoSair);
  try {
    const limite = Date.now() + 240_000;
    for (;;) {
      if (saiu) throw new Error("next dev terminou antes de ficar pronto");
      if (Date.now() > limite) throw new Error("next dev não respondeu 200 em /api/dados em 240s");
      try {
        const r = await fetch(`${baseUrl}/api/dados`);
        if (r.status === 200) break;
      } catch { /* ainda subindo */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (e) {
    await parar();
    const log = readFileSync(logPath, "utf8").split("\n").slice(-30).join("\n");
    throw new Error(`${(e as Error).message}\n--- log do next dev (${logPath}) ---\n${log}`);
  }
  return { baseUrl, parar };
}

/** Visita cada rota uma vez: o primeiro acesso ao next dev compila a rota (lento). */
export async function aquecer(page: Page, baseUrl: string, abas: string[]): Promise<void> {
  for (const aba of abas) {
    const r = await page.goto(`${baseUrl}/${aba}`, { waitUntil: "load", timeout: 240_000 }).catch(() => null);
    // 5xx no aquecimento é erro de compilação (ex.: a falha de next/font/google que deixava o teste esperando
    // 120 s pelo #rec-badge): falha na hora, com a mensagem certa, em vez de estourar o tempo depois.
    if (r && r.status() >= 500) throw new Error(`aquecimento de /${aba}: HTTP ${r.status()} do next dev`);
  }
}

export async function snapshotNovo(page: Page, baseUrl: string, c: Cenario, idsGraficos: string[] = []): Promise<Snapshot> {
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("dialog", (d) => { erros.push(`dialog: ${d.message()}`); void d.dismiss(); });

  await page.addInitScript("window.__name = (f) => f;");
  await page.addInitScript(`try { localStorage.setItem('tvMode', '${c.modoTv ? 1 : 0}'); } catch (e) {}`);
  await page.clock.install({ time: new Date(HOJE_FIXO) });
  await page.clock.setFixedTime(new Date(HOJE_FIXO)); // Date.now() parado: o LTV do Cross-sell divide por (agora − 1ª vigência)
  // A apresentação abre pelo botão "▶ Modo apresentação" da aba Metas (como o usuário); o antigo chama openKickoff().
  await page.goto(`${baseUrl}/${c.aba === "apresentacao" ? "metas" : c.aba}`, { waitUntil: "load", timeout: 120_000 });
  // Dados carregados: o badge sai de "" / "—" quando a base chega (fica "—" também se o fetch falhar).
  // A Exibição TV é tela cheia, sem o cabeçalho (#rec-badge): lá os dados chegaram quando o gráfico da carteira se registra.
  const sinalDeDados = c.aba === "exibicao-tv"
    ? "!!(window.__charts && window.__charts['tv-ex-ano-chart'])"
    : "(() => { const t = (document.getElementById('rec-badge')?.textContent ?? '').trim(); return t !== '' && t !== '—'; })()";
  try {
    await page.waitForFunction(sinalDeDados, undefined, { timeout: 120_000 });
  } catch {
    throw new Error(`dados/gráficos não carregaram (${c.nome}): sinal de dados ausente (#rec-badge vazio ou "—"; na Exibição TV, gráfico da carteira)`);
  }

  const container = conteinerDe(c);
  const apresentacao = c.aba === "apresentacao";
  // Na apresentação os `passos` valem para a aba Metas (filtros e %); o contêiner só existe depois de abrir.
  const existe = apresentacao || (await page.waitForSelector(container, { timeout: 15_000, state: "attached" }).then(() => true, () => false));

  if (existe) {
    const aplicar = async (p: Passo) => {
      if (p.tipo === "digitar") {
        await page.fill(`#${p.id}`, p.valor, { timeout: 10_000 }); // dispara input (o React escuta input)
      } else if (p.tipo === "preencher") {
        // fill() dispara input e change nativos (os campos de data são não controlados).
        await page.fill(`#${p.id}`, p.valor, { timeout: 10_000 });
      } else if (p.tipo === "clicar") {
        await page.click(p.seletor, { timeout: 10_000 });
      } else {
        for (const v of p.valores) {
          const caixa = page.locator(`#${p.id} input[type=checkbox][data-valor="${v}"]`);
          if (!(await caixa.isVisible())) await page.click(`#${p.id} .ms-trigger`, { timeout: 10_000 });
          await caixa.click({ timeout: 10_000 });
        }
        await page.mouse.click(1, 1); // clique fora fecha os dropdowns
      }
      await page.waitForTimeout(150);
    };
    for (const p of c.passos) await aplicar(p);
    if (apresentacao) {
      await page.click("#sc-metas-semanal .kickoff-btn", { timeout: 10_000 });
      await page.waitForSelector(container, { timeout: 30_000, state: "attached" });
      for (const p of c.pos ?? []) await aplicar(p);
    }
    await page.waitForTimeout(600);
  }

  // Gráficos registrados: todos os ids do dourado precisam existir em window.__charts (os ausentes
  // de verdade viram ausente-no-novo depois de esgotar a espera).
  // Aba ainda em migração (placeholder) nunca registra gráficos: não vale esperar.
  const emMigracao = existe && (await page.locator(`${container} >> text=Em migração`).count()) > 0;
  if (existe && !emMigracao && idsGraficos.length) {
    await page.waitForFunction((ids) => ids.every((id) => (window as any).__charts?.[id]), idsGraficos, { timeout: 20_000 }).catch(() => undefined);
  }

  const snap = await page.evaluate((container) => {
    const colapsar = (s: string) => s.replace(/\s+/g, " ").trim();
    const textos: Record<string, string> = {};
    const coleta = (el: Element) => { if (el.id && !(el.id in textos)) textos[el.id] = colapsar(el.textContent ?? ""); };
    const raiz = document.querySelector(container);
    if (raiz) {
      coleta(raiz);
      raiz.querySelectorAll("[id]").forEach(coleta);
    }
    // A apresentação e a Exibição TV são telas cheias por cima do painel: o cabeçalho do painel não faz parte delas.
    if (container !== "#kickoff-mode" && container !== "#tv-exibicao") for (const id of ["dash-subtitle", "rec-badge"]) { const e = document.getElementById(id); if (e) coleta(e); }

    const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
    const graficos: Snapshot["graficos"] = {};
    const reg = (window as any).__charts ?? {};
    for (const id of Object.keys(reg)) {
      const cv = document.getElementById(id);
      if (!raiz || !cv || !raiz.contains(cv)) continue;
      const data = reg[id].data;
      graficos[id] = {
        labels: (data.labels ?? []).map((l: unknown) => String(l)),
        datasets: data.datasets.map((d: any) => ({
          ...(d.label !== undefined ? { label: String(d.label) } : {}),
          data: (d.data ?? []).map(num),
        })),
      };
    }
    return { textos, graficos } as Snapshot;
  }, container);

  // Prova de que o Modo TV foi aplicado de fato (classe no <body>) nos dois lados.
  if (c.modoTv) snap.textos["body-tv-mode"] = String(await page.evaluate(() => document.body.classList.contains("tv-mode")));
  if (existe && !snap.textos[container.slice(1)]) {
    throw new Error(`dados/gráficos não carregaram (${c.nome}): snapshot trivial`);
  }
  if (erros.length) throw new Error(`erros na página nova (${c.nome}):\n${erros.join("\n")}`);
  return snap;
}
