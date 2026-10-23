CREATE TABLE "nomes_ignorados" (
	"nome" text PRIMARY KEY NOT NULL,
	"alterado_por" text NOT NULL,
	"alterado_em" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vinculos" (
	"nome" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"alterado_por" text NOT NULL,
	"alterado_em" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alterado_por" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alterado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;