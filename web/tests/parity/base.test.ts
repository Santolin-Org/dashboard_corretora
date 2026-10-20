/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { abrirAntigo, servirRaiz, ehProducao } from "../../parity/antigo";
import { parseProducao } from "../../src/domain/producao/parse";
import { aplicarCobertura } from "../../src/domain/producao/cobertura";
import { montarBase } from "../../src/domain/producao/base";
import { parseSaude } from "../../src/domain/saude/parse";
import { montarSinistros } from "../../src/domain/sinistros/parse";

declare const fmtD: (d: unknown) => string; // const global do app antigo
declare const ALL: any[]; declare const CLAIMS: any[]; declare const prodSources: any[]; declare const claimsSourceCounts: any;

let srv: Server;
let dir: string;
test.beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), "fixture-")); gerarFixture(dir); srv = await servirRaiz(); });
test.afterAll(() => { srv?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

test("montarBase/montarSinistros (Node) == applySharePointData antigo (ALL, prodSources, CLAIMS)", async ({ page }) => {
  const nomes = readdirSync(dir).filter(ehProducao).sort((a, b) => a.localeCompare(b));
  const fontes = nomes.map((nome) => ({ nome, linhas: parseProducao(ab(readFileSync(join(dir, nome)))), modificadoEm: "2026-10-14T12:00:00Z" }));
  const lerOpc = (n: string) => (existsSync(join(dir, n)) ? readFileSync(join(dir, n)) : null);
  const bufSaude = lerOpc("saude_fernando.xlsx"), bufAv = lerOpc("sinistrosAvisados.xlsx"), bufPg = lerOpc("sinistrosPagamentos.xlsx");

  const cob = aplicarCobertura(fontes);
  // Cobertura é regra nova (o app antigo não a tem): com a fixture inteira ela não pode remover nada.
  expect(cob.manifesto.every((m) => m.anosIgnorados.length === 0)).toBe(true);
  const novo = montarBase(fontes, bufSaude ? parseSaude(ab(bufSaude)) : null, "2026-10-15");
  const novoSin = montarSinistros(bufAv ? ab(bufAv) : null, bufPg ? ab(bufPg) : null);

  await abrirAntigo(page);
  const antigo = await page.evaluate((d) => {
    // Data local (São Paulo) do Date antigo (getFullYear/getMonth/getDate), só quando difere da fmtD: Linha.vigLocal/emLocal.
    const loc = (d: any) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
    const locais = (r: any) => ({
      ...(loc(r.vig) && loc(r.vig) !== fmtD(r.vig) ? { vigLocal: loc(r.vig) } : {}),
      ...(loc(r.em) && loc(r.em) !== fmtD(r.em) ? { emLocal: loc(r.em) } : {}),
    });
    const w = window as any;
    const dec = (b: string) => { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const payloads: any = {};
    payloads.producao = d.producao.map((f: any) => ({
      name: f.name, lastModified: "Wed, 14 Oct 2026 12:00:00 GMT", cached: false,
      rows: w.parseProducaoArrayBuffer(dec(f.b64)),
    }));
    if (d.av) payloads.sinistrosAvisados = dec(d.av);
    if (d.pg) payloads.sinistrosPagamentos = dec(d.pg);
    if (d.saude) payloads.saude = { buf: dec(d.saude), lastModified: "Wed, 14 Oct 2026 12:00:00 GMT" };
    document.getElementById("landing-screen")!.style.display = "none";
    w.applySharePointData(payloads, []);
    return {
      all: ALL.map((r: any) => ({ ...r, vig: fmtD(r.vig), em: fmtD(r.em), fim: fmtD(r.fim), cancel: fmtD(r.cancel), ...locais(r) })),
      fontes: prodSources.map((s: any) => ({ nome: s.name, total: s.total, dup: s.dup, anos: s.anos, ativasVencidas: s.ativasVencidas, saude: s.saude && { vinculadas: s.saude.vinculadas, criadas: s.saude.criadas } })),
      claims: CLAIMS.map((r: any) => ({ ...r, abertura: fmtD(r.abertura), aviso: fmtD(r.aviso), encerra: fmtD(r.encerra) })),
      cont: { ...claimsSourceCounts },
    };
  }, {
    producao: nomes.map((name) => ({ name, b64: readFileSync(join(dir, name)).toString("base64") })),
    av: bufAv?.toString("base64") ?? null, pg: bufPg?.toString("base64") ?? null, saude: bufSaude?.toString("base64") ?? null,
  });

  expect(novo.linhas.length).toBe(antigo.all.length);
  expect(novo.linhas.length).toBeGreaterThan(100);
  for (let i = 0; i < novo.linhas.length; i++) expect(novo.linhas[i], `ALL[${i}]`).toEqual(antigo.all[i]);
  expect(novo.linhas.some((l) => l.trocaSeg)).toBe(true);
  expect(novo.linhas.some((l) => l.saudeManual)).toBe(true);
  expect(novo.linhas.some((l) => l.saudeFaturaDe)).toBe(true);

  expect(novo.manifesto.length).toBe(antigo.fontes.length);
  novo.manifesto.forEach((m, i) => {
    const a = antigo.fontes[i];
    expect(m.nome).toBe(a.nome);
    expect(m.duplicadas, m.nome).toBe(a.dup);
    expect(m.ativasVencidas, m.nome).toBe(a.ativasVencidas ?? 0);
    expect(m.total, m.nome).toBe(a.total);
    expect(m.anos, m.nome).toEqual(a.anos);
    if (a.saude) expect(m.saude).toMatchObject(a.saude);
  });

  expect(novoSin.sinistros.length).toBe(antigo.claims.length);
  expect(novoSin.sinistros.length).toBeGreaterThan(0);
  for (let i = 0; i < novoSin.sinistros.length; i++) expect(novoSin.sinistros[i], `CLAIMS[${i}]`).toEqual(antigo.claims[i]);
  expect(novoSin.contagens).toEqual(antigo.cont);
});

test("cobertura: sem arquivos sobrepostos, nada é removido (G2)", () => {
  // Fixture sem o overlap 2024×2026: só a regra de cobertura, nada de dedup. Prova de que, quando os
  // anos não se sobrepõem (caso dos arquivos reais de hoje), a saída é idêntica à entrada.
  const f = (nome: string, vig: string) => ({ nome, modificadoEm: "2026-10-14T12:00:00Z", linhas: parseProducao(ab(readFileSync(join(dir, "producao_2024.xlsx")))).filter((l) => l.vig.startsWith(vig)) });
  const fs = [f("producao_2024.xlsx", "2024"), { ...f("producao_2025.xlsx", "2025"), nome: "producao_2025.xlsx" }];
  const r = aplicarCobertura(fs);
  expect(r.fontes.map((x) => x.linhas.length)).toEqual(fs.map((x) => x.linhas.length));
});
