/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { abrirAntigo, servirRaiz, ehProducao } from "../../parity/antigo";
import { parseProducao } from "../../src/domain/producao/parse";

declare const fmtD: (d: unknown) => string; // const global do app antigo
let srv: Server;
let dir: string;
test.beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), "fixture-")); gerarFixture(dir); srv = await servirRaiz(); });
test.afterAll(() => { srv?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

test("parseProducao (Node) == parseProducaoArrayBuffer antigo + fmtD", async ({ page }) => {
  await abrirAntigo(page);
  const arquivos = readdirSync(dir).filter(ehProducao);
  expect(arquivos.length).toBeGreaterThan(0);
  for (const nome of arquivos) {
    const b = readFileSync(join(dir, nome));
    const novo = parseProducao(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const antigo = await page.evaluate((b64) => {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = window as any;
      return w.parseProducaoArrayBuffer(u.buffer).map((r: any) => ({
        ...r, vig: fmtD(r.vig), em: fmtD(r.em), fim: fmtD(r.fim), cancel: fmtD(r.cancel), trocaSeg: false,
      }));
    }, b.toString("base64"));
    expect(novo.length).toBe(antigo.length);
    expect(novo.length).toBeGreaterThan(0);
    for (let i = 0; i < novo.length; i++) expect(novo[i], `${nome} linha ${i}`).toEqual(antigo[i]);
  }
});
