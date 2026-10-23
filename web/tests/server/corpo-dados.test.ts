import { describe, it, expect, beforeEach } from "vitest";
import { gunzipSync } from "node:zlib";
import { corpoGzip, payloadDados, reiniciarCorpo } from "@/server/corpo-dados";
import { codificarLinhas, codificarSinistros, decodificarLinhas } from "@/domain/serializacao";
import type { Sinistro } from "@/domain/sinistros/parse";
import { linha } from "../domain/helpers";

const sinFake = (o: Partial<Sinistro> = {}): Sinistro => ({
  id: "S1", sinNum: "1", abertura: "2026-01-01", aviso: "2026-01-02", encerra: "", status: "Aberto", seg: "Allianz",
  ramo: "Auto", cli: "Cli", valor: 100, pago: 0, impSeg: 0, franquia: 0, prejEst: 0, premioPago: 0, motivo: "",
  tipoSin: "", colab: "A", grp: "G", ...o,
});
const baseFake = (o: Partial<Parameters<typeof payloadDados>[0]> = {}): Parameters<typeof payloadDados>[0] => ({
  versao: "v1", geradoEm: "2026-10-22T00:00:00Z", hoje: "2026-10-22",
  linhas: [linha({ colab: "A" }), linha({ colab: "A , B" }), linha({ colab: "C" }), linha({ colab: "" })],
  sinistros: [], manifesto: [{ nome: "producao_2026.xlsx" } as never],
  contagensSinistros: { sinistrosAvisados: 3, sinistrosPagamentos: 2 }, avisos: ["x.xlsx: HTTP 500"], avisosSaude: ["s"],
  erroProducao: { mensagem: "m", arquivosNaPasta: ["a.xlsx"] }, ...o,
});
const ler = (g: Buffer) => JSON.parse(gunzipSync(g).toString("utf8"));

beforeEach(() => reiniciarCorpo());

describe("payloadDados por escopo", () => {
  it("payload do vendedor: só as linhas dele, sem sinistros, sem manifesto, sem avisos", () => {
    const p = payloadDados(baseFake({ sinistros: [sinFake()] }), { tipo: "colaboradores", nomes: ["A"] });
    expect(p.sinistros).toEqual(codificarSinistros([]));
    expect(p.manifesto).toEqual([]);
    expect(p.avisos).toEqual([]);
    expect(p.avisosSaude).toEqual([]);
    expect(p.contagensSinistros).toEqual({ sinistrosAvisados: 0, sinistrosPagamentos: 0 });
    expect(p).not.toHaveProperty("erroProducao");
    expect(p).not.toHaveProperty("semAcesso");
    expect(decodificarLinhas(p.linhas).map((r) => r.colab)).toEqual(["A", "A , B"]);
  });
  it("nada: semAcesso e nenhuma linha; tudo: todas as linhas e sinistros", () => {
    const n = payloadDados(baseFake({ sinistros: [sinFake()] }), { tipo: "nada" });
    expect(n.semAcesso).toBe(true);
    expect(n.linhas).toEqual(codificarLinhas([]));
    expect(n.sinistros).toEqual(codificarSinistros([]));
    const t = payloadDados(baseFake({ sinistros: [sinFake()] }), { tipo: "tudo" });
    expect(decodificarLinhas(t.linhas)).toHaveLength(4);
    expect(t.sinistros).toEqual(codificarSinistros([sinFake()]));
    expect(t.erroProducao).toBeDefined();
  });
});

describe("corpoGzip por escopo", () => {
  it("cache do corpo separa escopos com nomes diferentes", () => {
    const b = baseFake();
    const a = corpoGzip(b, { tipo: "colaboradores", nomes: ["A"] }), c = corpoGzip(b, { tipo: "colaboradores", nomes: ["C"] });
    expect(a.equals(c)).toBe(false);
    expect(decodificarLinhas(ler(a).linhas).map((r) => r.colab)).toEqual(["A", "A , B"]);
    expect(decodificarLinhas(ler(c).linhas).map((r) => r.colab)).toEqual(["C"]);
  });
});
