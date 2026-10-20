/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import * as XLSX from "xlsx";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { abrirAntigo, servirRaiz, ehProducao } from "../../parity/antigo";
import { parseProducao, COL } from "../../src/domain/producao/parse";

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

// xlsx independente da fixture: células de data com hora tardia (dia seguinte no app antigo em São Paulo).
test("parse com células de data com hora == antigo (inclui horário de verão antigo)", async ({ page }) => {
  await abrirAntigo(page);
  const seriais = [
    45658, 45658 + 20 / 24, 45658 + (20 * 60 + 59) / 1440, 45658 + 21 / 24, 45658 + 22 / 24, 45658 + (23 * 60 + 59) / 1440,
    43101 + (21 * 60 + 30) / 1440, 43101 + (21 * 60 + 59) / 1440, 43101 + 22 / 24, 43101 + (22 * 60 + 30) / 1440,
    43101 + 23 / 24, 45000 + 21.5 / 24, 40000.75, 44000.9999,
  ];
  const cab = [COL.tipo, COL.vig, COL.em, COL.fim, COL.cancel, COL.premio];
  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([cab, ...seriais.map(() => ["N", 0, 0, 0, 0, 1])]);
  seriais.forEach((v, i) => {
    for (const c of [1, 2, 3, 4]) ws[XLSX.utils.encode_cell({ r: i + 1, c })] = { t: "n", v, z: "dd/mm/yyyy hh:mm" };
  });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "P");
  const b = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const novo = parseProducao(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const antigo = await page.evaluate((b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = window as any;
    return w.parseProducaoArrayBuffer(u.buffer).map((r: any) => ({
      ...r, vig: fmtD(r.vig), em: fmtD(r.em), fim: fmtD(r.fim), cancel: fmtD(r.cancel), trocaSeg: false,
    }));
  }, b.toString("base64"));
  expect(novo.length).toBe(seriais.length);
  for (let i = 0; i < novo.length; i++) expect(novo[i], `serial ${seriais[i]}`).toEqual(antigo[i]);
  expect(novo[4].vig).toBe("2025-01-02"); // sanidade: o caso tardio de fato desloca o dia
});
