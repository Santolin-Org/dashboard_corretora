import { describe, it, expect } from "vitest";
import { cabecalhoServerTiming, etapasDaMontagem } from "@/server/tempos";

describe("cabecalhoServerTiming", () => {
  it("arredonda, nunca negativo, e tira aspas da descrição", () => {
    expect(cabecalhoServerTiming([{ nome: "base", ms: 12.6, desc: 'em "memória"' }, { nome: "total", ms: -1 }]))
      .toBe('base;dur=13;desc="em memória", total;dur=0');
  });

  it("etapas da montagem trazem quantas planilhas foram lidas do xlsx e quantas do snapshot", () => {
    const e = etapasDaMontagem({ seq: 1, listarMs: 1, producaoMs: 2, lidas: 1, snapshots: 6, fixosMs: 3, montarMs: 4, totalMs: 10 });
    expect(e.map((x) => x.nome)).toEqual(["listar", "producao", "fixos", "montar"]);
    expect(e[1].desc).toBe("1 lidas do xlsx, 6 de snapshot");
  });
});
