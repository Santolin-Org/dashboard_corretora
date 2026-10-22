import { sql } from "drizzle-orm";
import { boolean, check, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
  },
  (t) => [check("users_role_check", sql`${t.role} in ('admin','gestao','vendedor')`)],
);
