import { test, expect } from "@playwright/test";
import { compararSnapshots, semDivergencias } from "../../parity/diff";

const ANTIGO = "Comissão média (%) ▲ 1.0% 10.00% ant. 9.90% Taxa de churn ▼ 5.0% 20.00% 80 renov. ÷ 100 N+R ano ant. · ant. 25.00% Prêmio em risco ▲ 2.0% R$ 10,00";
const NOVO = "Comissão média (%) ▲ 1.0% 10.00% ant. 9.90% Taxa de churn ▲ 3.0% 3.00% 3 canc. ÷ 100 apólices · ant. 4.00% Prêmio em risco ▲ 2.0% R$ 10,00";
const snap = (t: string) => ({ textos: { "comp-kpis-grid": t }, graficos: {} });

test("o cartão Taxa de churn do Comparativo sai dos dois lados; os vizinhos continuam comparados", () => {
  expect(semDivergencias(ANTIGO)).toBe(semDivergencias(NOVO));
  expect(compararSnapshots("c", snap(ANTIGO), snap(NOVO))).toEqual([]);
  const outroRisco = NOVO.replace("R$ 10,00", "R$ 11,00");
  expect(compararSnapshots("c", snap(ANTIGO), snap(outroRisco))).toHaveLength(1);
});

test("não engole texto de outras abas: sem 'Prêmio em risco' logo depois, nada sai", () => {
  const retencao = "Taxa de churn 12% evitável " + "x".repeat(300) + " Prêmio em risco";
  expect(semDivergencias(retencao)).toBe(retencao);
});

test("o cartão Prêmio renovação também sai dos dois lados, sem levar a Taxa de renovação junto", () => {
  const a = "Prêmio novo ▲ 1.0% R$ 10,00 ant. R$ 9,00 Prêmio renovação ▲ 5.0% R$ 50,00 ant. R$ 40,00 · Δ +R$ 10,00 Taxa de renovação ▲ 1.0% 90.00% 9 renov.";
  const n = "Prêmio novo ▲ 1.0% R$ 10,00 ant. R$ 9,00 Prêmio renovação ▼ 50.0% R$ 50,00 base N+R ant. R$ 100,00 · Δ −R$ 50,00 Taxa de renovação ▲ 1.0% 90.00% 9 renov.";
  expect(compararSnapshots("c", snap(a), snap(n))).toEqual([]);
  expect(compararSnapshots("c", snap(a), snap(n.replace("90.00%", "91.00%")))).toHaveLength(1);
});
