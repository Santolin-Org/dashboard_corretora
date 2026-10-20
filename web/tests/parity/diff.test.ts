import { test, expect } from "@playwright/test";
import { compararSnapshots } from "../../parity/diff";
import type { Snapshot } from "../../parity/snapshot";

const snap = (textos: Snapshot["textos"] = {}, graficos: Snapshot["graficos"] = {}): Snapshot => ({ textos, graficos });
const graf = (labels: string[], data: (number | null)[]): Snapshot["graficos"][string] => ({ labels, datasets: [{ label: "S", data }] });

test("textos iguais não dão diferença", () => {
  expect(compararSnapshots("c", snap({ a: "x" }), snap({ a: "x" }))).toEqual([]);
});

test("NBSP e espaço comum são iguais", () => {
  expect(compararSnapshots("c", snap({ a: "R$ 1.234,50" }), snap({ a: "R$ 1.234,50" }))).toEqual([]);
});

test("texto diferente dá 'texto' com janela em volta do primeiro caractere diferente", () => {
  const longo = "x".repeat(500);
  const d = compararSnapshots("c", snap({ a: `${longo}A${longo}` }), snap({ a: `${longo}B${longo}` }));
  expect(d).toHaveLength(1);
  expect(d[0]).toMatchObject({ cenario: "c", tipo: "texto", id: "a" });
  expect(String(d[0].antigo).length).toBeLessThan(200);
  expect(String(d[0].antigo)).toContain("A");
  expect(String(d[0].novo)).toContain("B");
});

test("0.1+0.2 contra 0.3 em gráfico é igual", () => {
  expect(compararSnapshots("c", snap({}, { g: graf(["a"], [0.1 + 0.2]) }), snap({}, { g: graf(["a"], [0.3]) }))).toEqual([]);
});

test("label diferente dá 'grafico'", () => {
  const d = compararSnapshots("c", snap({}, { g: graf(["a"], [1]) }), snap({}, { g: graf(["b"], [1]) }));
  expect(d).toMatchObject([{ tipo: "grafico", id: "g" }]);
});

test("valor diferente além da tolerância e null vs número dão 'grafico'", () => {
  expect(compararSnapshots("c", snap({}, { g: graf(["a"], [1]) }), snap({}, { g: graf(["a"], [1.001]) }))).toHaveLength(1);
  expect(compararSnapshots("c", snap({}, { g: graf(["a"], [null]) }), snap({}, { g: graf(["a"], [0]) }))).toHaveLength(1);
});

test("id faltando no novo dá 'ausente-no-novo' (texto e gráfico)", () => {
  const d = compararSnapshots("c", snap({ a: "x" }, { g: graf([], []) }), snap());
  expect(d.map((x) => [x.tipo, x.id])).toEqual([["ausente-no-novo", "a"], ["ausente-no-novo", "g"]]);
});

test("ids só no novo: ignorados, exceto os que começam com ch-", () => {
  const d = compararSnapshots("c", snap(), snap({ extra: "x", "ch-novo": "y" }, { "ch-g": graf([], []), g2: graf([], []) }));
  expect(d.map((x) => [x.tipo, x.id])).toEqual([["sobra-no-novo", "ch-novo"], ["sobra-no-novo", "ch-g"]]);
});
