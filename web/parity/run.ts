// O fuso precisa valer antes de qualquer uso de Date: o SheetJS grava células Date pelo TZ do processo.
process.env.TZ = "America/Sao_Paulo";
// Uso: tsx parity/run.ts --lado antigo|novo|ambos [--cenario <nome>] [--abas a,b] [--dados <dir>] [--fixture] [--regerar-antigo]
//   --lado antigo   só captura o app antigo e grava os dourados.
//   --lado novo     sobe o app novo (next dev) e compara com os dourados já gravados.
//   --lado ambos    captura o antigo e compara com o novo. Com --fixture o antigo NÃO é regerado (usa
//                   parity/golden-fixture/, versionado) a menos que se passe --regerar-antigo.
//   --fixture       gera a fixture sintética num diretório temporário; dourados em parity/golden-fixture/.
//   Em novo/ambos (com ou sem --fixture), sem --abas/--cenario, roda só as abas de abas-portadas.ts (lista vazia = nada a fazer).
//   sem --fixture:  lê --dados (padrão parity/data), dourados em parity/.golden/ (ignorado pelo git).
//   --abas a,b      limita aos cenários dessas abas (sobrepõe abas-portadas.ts; sem casamento = erro).
// O relatório de diferenças vai para parity/.golden/relatorio.md; sai com código 1 se houver qualquer diferença.
import { mkdirSync, mkdtempSync, readdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { CENARIOS } from "./cenarios";
import { snapshotAntigo, servirRaiz } from "./antigo";
import { aquecer, snapshotNovo, subirServidorNovo } from "./novo";
import { compararSnapshots, type Diferenca } from "./diff";
import { ABAS_PORTADAS } from "./abas-portadas";
import { gerarFixture } from "./fixtures/make-fixture";
import type { Snapshot } from "./snapshot";

const PARITY = __dirname;

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (nome: string) => process.argv.includes(`--${nome}`);

// Chaves ordenadas: o JSON versionado fica estável entre execuções.
function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, ordenar(x)]));
  }
  return v;
}

async function lado_antigo(dados: string, saida: string, nomes: string[]) {
  const srv = await servirRaiz();
  const browser = await chromium.launch();
  const resumo: string[] = [];
  try {
    mkdirSync(saida, { recursive: true });
    for (const nome of nomes) {
      const c = CENARIOS.find((x) => x.nome === nome)!;
      const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });
      const page = await ctx.newPage();
      try {
        const snap: Snapshot = await snapshotAntigo(page, dados, c);
        writeFileSync(join(saida, `${c.nome}.json`), JSON.stringify(ordenar(snap), null, 2) + "\n");
        resumo.push(`${c.nome}: ${Object.keys(snap.textos).length} ids, ${Object.keys(snap.graficos).length} gráficos`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(resumo.join("\n"));
}

const resumirValor = (v: unknown) => {
  const t = typeof v === "string" ? v : JSON.stringify(v);
  return (t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
};

function relatorio(nomes: string[], difs: Diferenca[], saida: string): string {
  const linhas = ["# Relatório de paridade", "", `Cenários comparados: ${nomes.length}. Diferenças: ${difs.length}.`, ""];
  for (const nome of nomes) {
    const d = difs.filter((x) => x.cenario === nome);
    linhas.push(`## ${nome} — ${d.length ? `${d.length} diferença(s)` : "OK"}`, "");
    if (!d.length) continue;
    linhas.push("| tipo | id | antigo | novo |", "|---|---|---|---|");
    for (const x of d) linhas.push(`| ${x.tipo} | ${x.id} | ${x.antigo === undefined ? "" : resumirValor(x.antigo).slice(0, 400)} | ${x.novo === undefined ? "" : resumirValor(x.novo).slice(0, 400)} |`);
    linhas.push("");
  }
  mkdirSync(saida, { recursive: true });
  const arq = join(saida, "relatorio.md");
  writeFileSync(arq, linhas.join("\n") + "\n");
  return arq;
}

async function lado_novo(dados: string, goldenDir: string, nomes: string[]): Promise<Diferenca[]> {
  const srv = await subirServidorNovo(dados);
  const browser = await chromium.launch();
  const difs: Diferenca[] = [];
  try {
    // Aquece cada rota (primeira visita compila no next dev) antes de medir/capturar.
    const aq = await browser.newPage();
    await aquecer(aq, srv.baseUrl, [...new Set(nomes.map((n) => CENARIOS.find((x) => x.nome === n)!.aba))]);
    await aq.close();
    for (const nome of nomes) {
      const c = CENARIOS.find((x) => x.nome === nome)!;
      const antigo = JSON.parse(readFileSync(join(goldenDir, `${nome}.json`), "utf8")) as Snapshot;
      const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });
      const page = await ctx.newPage();
      try {
        const novo = await snapshotNovo(page, srv.baseUrl, c, Object.keys(antigo.graficos));
        const d = compararSnapshots(nome, antigo, novo);
        console.log(`${nome}: ${d.length ? `${d.length} diferença(s)` : "OK"}`);
        difs.push(...d);
      } catch (e) {
        console.log(`${nome}: ERRO ${(e as Error).message.split("\n")[0]}`);
        difs.push({ cenario: nome, tipo: "texto", id: "(erro ao capturar o app novo)", novo: (e as Error).message });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    srv.parar();
  }
  return difs;
}

async function main() {
  const lado = arg("lado") ?? "antigo";
  if (!["antigo", "novo", "ambos"].includes(lado)) throw new Error(`--lado inválido: ${lado}`);

  const filtro = arg("cenario");
  const abas = arg("abas")?.split(",").map((a) => a.trim()).filter(Boolean);
  const fixture = flag("fixture");
  // Com o lado novo envolvido (fixture ou dados reais): por padrão só as abas portadas.
  const abasAlvo = abas ?? (lado !== "antigo" && !filtro ? (ABAS_PORTADAS as string[]) : undefined);
  const nomes = CENARIOS.filter((c) => (!filtro || c.nome === filtro) && (!abasAlvo || abasAlvo.includes(c.aba))).map((c) => c.nome);
  if (filtro && !CENARIOS.some((c) => c.nome === filtro)) throw new Error(`cenário desconhecido: ${filtro}`);
  if (!nomes.length && abas) throw new Error(`--abas ${abas.join(",")} não casa com nenhum cenário`);
  if (!nomes.length) {
    console.log(abasAlvo ? "nada a comparar: nenhuma aba portada (abas-portadas.ts) ou aba desconhecida" : "nenhum cenário");
    return;
  }

  let dados: string;
  let goldenDir: string;
  let tmp: string | undefined;
  if (fixture) {
    tmp = mkdtempSync(join(tmpdir(), "fixture-"));
    gerarFixture(tmp);
    dados = tmp;
    goldenDir = join(PARITY, "golden-fixture");
  } else {
    dados = resolve(arg("dados") ?? join(PARITY, "data"));
    goldenDir = join(PARITY, ".golden");
    if (!existsSync(dados) || !readdirSync(dados).some((f) => !f.startsWith("."))) {
      console.log("pulado: sem dados reais");
      return;
    }
  }
  try {
    // Antigo: sempre em --lado antigo/ambos sem fixture; com fixture só sob --regerar-antigo (dourados versionados).
    if (lado === "antigo" || (lado === "ambos" && (!fixture || flag("regerar-antigo")))) await lado_antigo(dados, goldenDir, nomes);
    if (lado === "antigo") return;
    const faltando = nomes.filter((n) => !existsSync(join(goldenDir, `${n}.json`)));
    if (faltando.length) throw new Error(`dourados ausentes em ${goldenDir}: ${faltando.join(", ")} (rode --lado antigo)`);
    const difs = await lado_novo(dados, goldenDir, nomes);
    const arq = relatorio(nomes, difs, join(PARITY, ".golden"));
    console.log(`\n${difs.length} diferença(s) em ${nomes.length} cenário(s). Relatório: ${arq}`);
    if (difs.length) process.exitCode = 1;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
