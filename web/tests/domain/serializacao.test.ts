import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { carregarFixture } from "./fixture";
import { linha } from "./helpers";
import { montarSinistros } from "@/domain/sinistros/parse";
import {
  codificarLinhas, decodificarLinhas, codificarSinistros, decodificarSinistros,
} from "@/domain/serializacao";
import type { Linha } from "@/domain/tipos";

const viaJSON = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("serialização colunar", () => {
  it("linhas da fixture: ida e volta (inclusive via JSON) reproduz em profundidade", () => {
    const { fontes } = carregarFixture();
    const linhas = fontes.flatMap((f) => f.linhas);
    expect(linhas.length).toBeGreaterThan(0);
    expect(decodificarLinhas(viaJSON(codificarLinhas(linhas)))).toStrictEqual(linhas);
  });

  it("campos opcionais e booleanos preservados (presente/ausente)", () => {
    const l = [
      linha({ trocaSeg: true, saudeManual: true, saudeFaturaDe: "X" }),
      linha({ trocaSeg: false, saudeManual: false }),
      linha({}),
    ];
    expect(decodificarLinhas(viaJSON(codificarLinhas(l)))).toStrictEqual(l);
    expect(decodificarLinhas(codificarLinhas([]))).toEqual([]);
  });

  it("sinistros da fixture: ida e volta", () => {
    const { avisados, pagamentos } = carregarFixture();
    const { sinistros } = montarSinistros(avisados, pagamentos);
    expect(sinistros.length).toBeGreaterThan(0);
    expect(decodificarSinistros(viaJSON(codificarSinistros(sinistros)))).toStrictEqual(sinistros);
  });

  it("150 mil linhas: gzip do colunar < 40% do gzip do JSON ingênuo", () => {
    const segs = ["Auto", "Vida", "Saúde", "Residencial", "Empresarial"];
    const colabs = Array.from({ length: 12 }, (_, i) => `Colaborador ${i}`);
    const base: Linha[] = [];
    for (let i = 0; i < 150_000; i++) {
      const d = (n: number) => `2025-${String(1 + (n % 12)).padStart(2, "0")}-${String(1 + (n % 28)).padStart(2, "0")}`;
      base.push(linha({
        tipo: i % 7 === 0 ? "Endosso" : "Apólice", vig: d(i), em: d(i * 3), fim: d(i + 5), cli: `Cliente ${i % 40000}`,
        seg: segs[i % 5], ramo: `Ramo ${i % 9}`, grp: `Grupo ${i % 20}`, premio: 100 + (i % 5000) + 0.37, com: 10 + (i % 300) + 0.11,
        colab: colabs[i % 12], sit: i % 11 === 0 ? "Cancelada" : "Ativa", motivo: i % 11 === 0 ? "Inadimplência" : "",
        cancel: i % 11 === 0 ? d(i) : "", docDigits: String(10000000000 + (i % 40000)), tipoPessoa: i % 3 ? "PF" : "PJ",
        tipoDoc: "CPF", campanha: i % 4 ? "" : "Black", apolice: `AP${1000000 + i}`, endosso: String(i % 3),
      }));
    }
    const ingenuo = gzipSync(JSON.stringify(base)).length;
    const colunar = gzipSync(JSON.stringify(codificarLinhas(base))).length;
    console.log(`gzip ingênuo=${ingenuo} colunar=${colunar} razão=${(colunar / ingenuo).toFixed(3)}`);
    expect(colunar).toBeLessThan(ingenuo * 0.4);
  }, 60_000);
});
