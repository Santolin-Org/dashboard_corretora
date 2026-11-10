CREATE TABLE "atribuicoes_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"seg" text NOT NULL,
	"apolice" text NOT NULL,
	"fim" text NOT NULL,
	"acao" text NOT NULL,
	"para" text,
	"de" text NOT NULL,
	"por" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atribuicoes_historico_acao_check" CHECK ("atribuicoes_historico"."acao" in ('atribuir','desfazer'))
);
--> statement-breakpoint
CREATE TABLE "atribuicoes_renovacao" (
	"seg" text NOT NULL,
	"apolice" text NOT NULL,
	"fim" text NOT NULL,
	"para" text NOT NULL,
	"de" text NOT NULL,
	"alterado_por" text NOT NULL,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atribuicoes_renovacao_seg_apolice_fim_pk" PRIMARY KEY("seg","apolice","fim")
);
