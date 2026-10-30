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
