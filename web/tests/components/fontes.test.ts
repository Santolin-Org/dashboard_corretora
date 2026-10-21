import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

// Causa do flaky de tests/parity/exportar-retencao (e de outras rotas no harness): next/font/google baixa as
// fontes de fonts.googleapis.com ao compilar; uma resposta ruim faz o next dev responder 500 em /retencao
// ("next/font/google queries have exactly one entry") e o teste espera 120 s pelo #rec-badge. As fontes
// agora ficam no repositório (src/styles/fontes.css); nada no app pode voltar a depender da rede ao compilar.
const SRC = join(__dirname, "..", "..", "src");
const arquivos = (d: string): string[] =>
  readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? arquivos(p) : [p]; });

describe("fontes auto-hospedadas", () => {
  it("nenhum arquivo de src/ importa next/font/google", () => {
    const comGoogle = arquivos(SRC).filter((p) => /\.(tsx?|mjs|js)$/.test(p) && /["']next\/font\/google["']/.test(readFileSync(p, "utf8")));
    expect(comGoogle).toEqual([]);
  });
  it("fontes.css declara Inter, Syne e JetBrains Mono nos pesos do app antigo, com arquivos presentes", () => {
    const css = join(SRC, "styles", "fontes.css");
    const t = readFileSync(css, "utf8");
    const faces = [...t.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]);
    const pesos = (fam: string) => [...new Set(faces.filter((f) => f.includes(`font-family:${fam};`)).map((f) => /font-weight:(\d+)/.exec(f)![1]))].sort();
    expect(pesos("Inter")).toEqual(["400", "500", "600"]);
    expect(pesos("Syne")).toEqual(["600", "800"]);
    expect(pesos("JetBrains Mono")).toEqual(["400", "600"]);
    for (const m of t.matchAll(/url\("\.\/([^"]+)"\)/g)) expect(existsSync(join(dirname(css), m[1])), m[1]).toBe(true);
    expect(t).not.toMatch(/https?:\/\//);
  });
  it("layout importa fontes.css", () => {
    expect(readFileSync(join(SRC, "app", "layout.tsx"), "utf8")).toContain('import "@/styles/fontes.css";');
  });
});
