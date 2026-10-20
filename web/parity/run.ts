// O fuso precisa valer antes de qualquer uso de Date: o SheetJS grava células Date pelo TZ do processo.
process.env.TZ = "America/Sao_Paulo";
// Uso: tsx parity/run.ts --lado antigo|novo|ambos [--cenario <nome>] [--dados <dir>] [--fixture]
//   --fixture  gera a fixture sintética em diretório temporário e grava em parity/golden-fixture/
//   sem --fixture: lê --dados (padrão parity/data) e grava em parity/.golden/ (ignorado pelo git)
import { mkdirSync, mkdtempSync, readdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { CENARIOS } from "./cenarios";
import { snapshotAntigo, servirRaiz } from "./antigo";
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

async function main() {
  const lado = arg("lado") ?? "antigo";
  if (!["antigo", "novo", "ambos"].includes(lado)) throw new Error(`--lado inválido: ${lado}`);
  if (lado !== "antigo") throw new Error(`--lado ${lado}: lado novo e diff entram na Task 12`);

  const filtro = arg("cenario");
  const nomes = CENARIOS.map((c) => c.nome).filter((n) => !filtro || n === filtro);
  if (!nomes.length) throw new Error(`cenário desconhecido: ${filtro}`);

  if (flag("fixture")) {
    const tmp = mkdtempSync(join(tmpdir(), "fixture-"));
    try {
      gerarFixture(tmp);
      await lado_antigo(tmp, join(PARITY, "golden-fixture"), nomes);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    return;
  }
  const dados = resolve(arg("dados") ?? join(PARITY, "data"));
  if (!existsSync(dados) || !readdirSync(dados).some((f) => !f.startsWith("."))) {
    console.log("pulado: sem dados reais");
    return;
  }
  await lado_antigo(dados, join(PARITY, ".golden"), nomes);
}

main().catch((e) => { console.error(e); process.exit(1); });
