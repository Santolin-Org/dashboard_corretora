import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  desfazerVinculoRenovacao, listarVinculosRenovacao, salvarVinculoRenovacao, setDb,
} from "@/server/db/client";
import { vinculosRenovacao, vinculosRenovacaoHistorico } from "@/server/db/schema";

const pg = new PGlite();
const db = drizzle(pg);
// Dados fictícios: antiga A1 (fim 2026-11-15) e renovações R1/R2.
const ANT = { seg: "SegX", apolice: "A1", fim: "2026-11-15" };
const R1 = { renSeg: "SegX", renApolice: "R1", renVig: "2026-11-14" };
const R2 = { renSeg: "SegX", renApolice: "R2", renVig: "2026-11-20" };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDb(db);
});
beforeEach(async () => {
  await db.delete(vinculosRenovacao);
  await db.delete(vinculosRenovacaoHistorico);
});

const historico = async () =>
  (await pg.query<{ acao: string; apolice: string; ren_apolice: string; por: string }>(
    "select acao, apolice, ren_apolice, por from vinculos_renovacao_historico order by id",
  )).rows;

describe("vínculos de renovação no banco", () => {
  it("salvar → listar com autor e data; histórico 'vincular'", async () => {
    expect(await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false })).toEqual({ ok: true, desfeitos: [] });
    const l = await listarVinculosRenovacao();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ ...ANT, ...R1, por: "g@x" });
    expect(Number.isNaN(Date.parse(l[0].em))).toBe(false);
    expect(await historico()).toEqual([{ acao: "vincular", apolice: "A1", ren_apolice: "R1", por: "g@x" }]);
  });

  it("mesmo par de novo: ok, nada desfeito, sem histórico repetido", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false });
    expect(await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false })).toEqual({ ok: true, desfeitos: [] });
    expect(await historico()).toHaveLength(1);
  });

  it("conflito na antiga sem substituir: devolve o vínculo existente e não muda nada", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false });
    const r = await salvarVinculoRenovacao({ ...ANT, ...R2 }, "h@x", { substituir: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflitos).toMatchObject([{ ...ANT, ...R1 }]);
    expect(await listarVinculosRenovacao()).toMatchObject([{ ...R1 }]);
    expect(await historico()).toHaveLength(1);
  });

  it("conflito na R (já vinculada a outra antiga)", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false });
    const r = await salvarVinculoRenovacao({ ...ANT, apolice: "A2", ...R1 }, "g@x", { substituir: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflitos.map((c) => c.apolice)).toEqual(["A1"]);
  });

  it("substituir desfaz os conflitantes (antiga e R) e grava o novo; histórico registra tudo", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false }); // A1 ← R1
    await salvarVinculoRenovacao({ ...ANT, apolice: "A2", ...R2 }, "g@x", { substituir: false }); // A2 ← R2
    // A1 ← R2: conflita com A1←R1 (antiga) e com A2←R2 (R).
    const r = await salvarVinculoRenovacao({ ...ANT, ...R2 }, "h@x", { substituir: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.desfeitos.map((d) => `${d.apolice}<${d.renApolice}`).sort()).toEqual(["A1<R1", "A2<R2"]);
    expect((await listarVinculosRenovacao()).map((v) => `${v.apolice}<${v.renApolice}`)).toEqual(["A1<R2"]);
    const h = await historico();
    expect(h.slice(2).map((x) => x.acao).sort()).toEqual(["desfazer", "desfazer", "vincular"]);
    expect(h.at(-1)).toMatchObject({ acao: "vincular", apolice: "A1", ren_apolice: "R2", por: "h@x" });
  });

  it("desfazer: true e histórico; inexistente: false", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false });
    expect(await desfazerVinculoRenovacao(ANT, "h@x")).toBe(true);
    expect(await listarVinculosRenovacao()).toEqual([]);
    expect((await historico()).at(-1)).toMatchObject({ acao: "desfazer", apolice: "A1", ren_apolice: "R1", por: "h@x" });
    expect(await desfazerVinculoRenovacao(ANT, "h@x")).toBe(false);
  });
});

describe("substituição no Neon (driver com batch)", () => {
  it("todas as escritas vão num único batch; nada roda fora dele", async () => {
    await salvarVinculoRenovacao({ ...ANT, ...R1 }, "g@x", { substituir: false });
    const batch = vi.fn(async () => []);
    // O mesmo banco, mas com `batch` (como o neon-http): as escritas não podem ser executadas fora dele.
    const comBatch = new Proxy(db, { get: (t, p) => (p === "batch" ? batch : Reflect.get(t, p)) });
    const r = await salvarVinculoRenovacao({ ...ANT, ...R2 }, "h@x", { substituir: true }, comBatch as never);
    expect(r.ok).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    expect((batch.mock.calls[0] as unknown[][])[0]).toHaveLength(4); // apaga A1←R1, histórico desfazer, grava, histórico vincular
    expect((await listarVinculosRenovacao()).map((v) => v.renApolice)).toEqual(["R1"]); // nada aplicado fora do batch
  });
});
