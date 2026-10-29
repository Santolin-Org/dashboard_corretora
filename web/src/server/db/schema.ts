import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
