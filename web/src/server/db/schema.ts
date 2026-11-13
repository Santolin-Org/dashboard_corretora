import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export type Papel = "admin" | "gestao" | "vendedor";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Sempre em minúsculas. */
    email: text("email").notNull().unique(),
    nome: text("nome").notNull(),
    role: text("role").$type<Papel>().notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    alteradoPor: text("alterado_por"),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('admin','gestao','vendedor')`)],
);

/** Nome da coluna COLABORADOR (exato) → login dono dele. Um nome é de um login só. */
export const vinculos = pgTable("vinculos", {
  nome: text("nome").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  alteradoPor: text("alterado_por").notNull(),
  alteradoEm: timestamp("alterado_em", { withTimezone: true }).defaultNow(),
});

/** Nomes da planilha que não são de vendedor (somem da lista "sem dono"). */
export const nomesIgnorados = pgTable("nomes_ignorados", {
  nome: text("nome").primaryKey(),
  alteradoPor: text("alterado_por").notNull(),
  alteradoEm: timestamp("alterado_em", { withTimezone: true }).defaultNow(),
});

/** Atribuição de renovação: a vigência (seguradora + apólice + fim) de uma apólice que chega para renovar passa a ser
 *  de outro colaborador (`para`, nome da coluna COLABORADOR). `de`: o colaborador da planilha quando foi atribuída. */
export const atribuicoesRenovacao = pgTable(
  "atribuicoes_renovacao",
  {
    seg: text("seg").notNull(),
    apolice: text("apolice").notNull(),
    fim: text("fim").notNull(),
    para: text("para").notNull(),
    de: text("de").notNull(),
    alteradoPor: text("alterado_por").notNull(),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seg, t.apolice, t.fim] })],
);

/** Histórico de atribuições: cada atribuir/desfazer, com autor e data. */
export const atribuicoesHistorico = pgTable(
  "atribuicoes_historico",
  {
    id: serial("id").primaryKey(),
    seg: text("seg").notNull(),
    apolice: text("apolice").notNull(),
    fim: text("fim").notNull(),
    acao: text("acao").$type<"atribuir" | "desfazer">().notNull(),
    para: text("para"),
    de: text("de").notNull(),
    por: text("por").notNull(),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("atribuicoes_historico_acao_check", sql`${t.acao} in ('atribuir','desfazer')`)],
);

/** Vínculo manual de renovação (spec 2026-11-13): a gestão diz que a R (`ren_*`: seguradora + apólice + início) é a
 *  renovação da antiga (seguradora + apólice + fim), quando a ligação automática não acha (cliente renovou em outro
 *  nome). Uma antiga tem no máximo um vínculo e uma R também. */
export const vinculosRenovacao = pgTable(
  "vinculos_renovacao",
  {
    seg: text("seg").notNull(),
    apolice: text("apolice").notNull(),
    fim: text("fim").notNull(),
    renSeg: text("ren_seg").notNull(),
    renApolice: text("ren_apolice").notNull(),
    renVig: text("ren_vig").notNull(),
    alteradoPor: text("alterado_por").notNull(),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seg, t.apolice, t.fim] }), unique("vinculos_renovacao_ren_unq").on(t.renSeg, t.renApolice, t.renVig)],
);

/** Histórico de vínculos: cada vincular/desfazer, com autor e data. */
export const vinculosRenovacaoHistorico = pgTable(
  "vinculos_renovacao_historico",
  {
    id: serial("id").primaryKey(),
    seg: text("seg").notNull(),
    apolice: text("apolice").notNull(),
    fim: text("fim").notNull(),
    renSeg: text("ren_seg").notNull(),
    renApolice: text("ren_apolice").notNull(),
    renVig: text("ren_vig").notNull(),
    acao: text("acao").$type<"vincular" | "desfazer">().notNull(),
    por: text("por").notNull(),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("vinculos_renovacao_historico_acao_check", sql`${t.acao} in ('vincular','desfazer')`)],
);
