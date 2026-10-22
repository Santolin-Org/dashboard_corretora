import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { gerarFixture } from "../../parity/fixtures/make-fixture";
import { snapshotAntigo, servirRaiz } from "../../parity/antigo";
import { CENARIOS } from "../../parity/cenarios";

let srv: Server;
let dir: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "fixture-"));
  gerarFixture(dir);
  srv = await servirRaiz();
});
test.afterAll(() => {
  srv?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("snapshot antigo de visao-geral-padrao", async ({ page }) => {
  const c = CENARIOS.find((x) => x.nome === "visao-geral-padrao")!;
  const s = await snapshotAntigo(page, dir, c);
  expect(Object.keys(s.textos).length).toBeGreaterThan(10);
  expect(s.graficos["ch-evolucao"].labels.length).toBeGreaterThan(0);
  expect(s.textos["rec-badge"]).toMatch(/registros$/);
});
