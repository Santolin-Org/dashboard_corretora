CREATE TABLE "vinculos_renovacao" (
	"seg" text NOT NULL,
	"apolice" text NOT NULL,
	"fim" text NOT NULL,
	"ren_seg" text NOT NULL,
	"ren_apolice" text NOT NULL,
	"ren_vig" text NOT NULL,
	"alterado_por" text NOT NULL,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_renovacao_seg_apolice_fim_pk" PRIMARY KEY("seg","apolice","fim"),
	CONSTRAINT "vinculos_renovacao_ren_unq" UNIQUE("ren_seg","ren_apolice","ren_vig")
);
--> statement-breakpoint
CREATE TABLE "vinculos_renovacao_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"seg" text NOT NULL,
	"apolice" text NOT NULL,
	"fim" text NOT NULL,
	"ren_seg" text NOT NULL,
	"ren_apolice" text NOT NULL,
	"ren_vig" text NOT NULL,
	"acao" text NOT NULL,
	"por" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_renovacao_historico_acao_check" CHECK ("vinculos_renovacao_historico"."acao" in ('vincular','desfazer'))
);
