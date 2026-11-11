import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { desfazerAtribuicao, listarAtribuicoes, salvarAtribuicao, salvarAtribuicoes, setDb } from "@/server/db/client";
import { atribuicoesHistorico, atribuicoesRenovacao } from "@/server/db/schema";

const pg = new PGlite();
const db = drizzle(pg);
const K = { seg: "SegX", apolice: "A1", fim: "2026-11-10" };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  await db.delete(atribuicoesRenovacao);
  await db.delete(atribuicoesHistorico);
});

const historico = async () =>
  (await pg.query<{ acao: string; para: string | null; de: string; por: string }>(
    "select acao, para, de, por from atribuicoes_historico order by id",
  )).rows;

describe("atribuições no banco", () => {
  it("salvar → listar devolve a atribuição com autor e data", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "gestor@x");
    const l = await listarAtribuicoes();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ ...K, para: "BIA", de: "ANA", por: "gestor@x" });
    expect(typeof l[0].em).toBe("string");
    expect(Number.isNaN(Date.parse(l[0].em))).toBe(false);
  });

  it("salvar de novo na mesma vigência troca o responsável e o histórico guarda as duas", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "gestor@x");
    await salvarAtribuicao({ ...K, para: "CAIO", de: "ANA" }, "outro@x");
    const l = await listarAtribuicoes();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ para: "CAIO", por: "outro@x" });
    expect(await historico()).toEqual([
      { acao: "atribuir", para: "BIA", de: "ANA", por: "gestor@x" },
      { acao: "atribuir", para: "CAIO", de: "ANA", por: "outro@x" },
    ]);
  });

  it("vigências diferentes da mesma apólice são atribuições diferentes", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "g");
    await salvarAtribuicao({ ...K, fim: "2027-11-10", para: "CAIO", de: "ANA" }, "g");
    expect((await listarAtribuicoes()).map((a) => a.para).sort()).toEqual(["BIA", "CAIO"]);
  });

  it("desfazer apaga, registra no histórico e devolve false se não existia", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "g");
    expect(await desfazerAtribuicao(K, "g2")).toBe(true);
    expect(await listarAtribuicoes()).toEqual([]);
    expect((await historico()).at(-1)).toEqual({ acao: "desfazer", para: null, de: "ANA", por: "g2" });
    expect(await desfazerAtribuicao(K, "g2")).toBe(false);
    expect(await historico()).toHaveLength(2);
  });

  it("salvar em lote grava todas, troca as que já existiam e registra cada uma no histórico", async () => {
    await salvarAtribuicao({ ...K, para: "BIA", de: "ANA" }, "g");
    await salvarAtribuicoes([
      { ...K, para: "CAIO", de: "ANA" },
      { ...K, apolice: "A2", para: "CAIO", de: "ANA" },
      { ...K, apolice: "A3", para: "CAIO", de: "DUDA" },
    ], "lote@x");
    const l = await listarAtribuicoes();
    expect(l.map((a) => [a.apolice, a.para, a.de, a.por])).toEqual([
      ["A1", "CAIO", "ANA", "lote@x"], ["A2", "CAIO", "ANA", "lote@x"], ["A3", "CAIO", "DUDA", "lote@x"],
    ]);
    expect((await historico()).slice(1)).toEqual([
      { acao: "atribuir", para: "CAIO", de: "ANA", por: "lote@x" },
      { acao: "atribuir", para: "CAIO", de: "ANA", por: "lote@x" },
      { acao: "atribuir", para: "CAIO", de: "DUDA", por: "lote@x" },
    ]);
  });

  it("lote com a mesma vigência repetida fica com a última (não quebra o upsert)", async () => {
    await salvarAtribuicoes([{ ...K, para: "BIA", de: "ANA" }, { ...K, para: "CAIO", de: "ANA" }], "g");
    expect((await listarAtribuicoes()).map((a) => a.para)).toEqual(["CAIO"]);
  });

  it("lote vazio não faz nada", async () => {
    await salvarAtribuicoes([], "g");
    expect(await listarAtribuicoes()).toEqual([]);
    expect(await historico()).toEqual([]);
  });
});
