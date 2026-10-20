export type AbaId =
  | "visao-geral" | "producao" | "retencao" | "crosssell" | "comparativo" | "metas" | "sinistros"
  | "exibicao-tv" | "apresentacao";

export type Passo =
  | { tipo: "preencher"; id: string; valor: string } // input date/text: define value e dispara 'change'
  | { tipo: "clicar"; seletor: string }
  | { tipo: "multiselect"; id: "ms-col" | "ms-grp" | "ms-ram" | "ms-seg"; valores: string[] };

export type Cenario = { nome: string; aba: AbaId; passos: Passo[] };

export const HOJE_FIXO = "2026-10-15T12:00:00-03:00";

const ABAS_PRODUCAO: AbaId[] = ["visao-geral", "producao", "retencao", "crosssell", "comparativo", "metas"];

function cenariosDaAba(aba: AbaId): Cenario[] {
  return [
    { nome: `${aba}-padrao`, aba, passos: [] },
    {
      nome: `${aba}-vigencia`, aba,
      passos: [
        { tipo: "preencher", id: "f-vig-s", valor: "2026-01-01" },
        { tipo: "preencher", id: "f-vig-e", valor: "2026-09-30" },
      ],
    },
    { nome: `${aba}-colab`, aba, passos: [{ tipo: "multiselect", id: "ms-col", valores: ["ANA CLARA MENDES"] }] },
    {
      nome: `${aba}-tipos`, aba,
      passos: [
        { tipo: "clicar", seletor: '#tipo-btns .tipo-btn[data-tipo="N"]' },
        { tipo: "clicar", seletor: '#tipo-btns .tipo-btn[data-tipo="EN"]' },
      ],
    },
    {
      nome: `${aba}-ramo-seg`, aba,
      passos: [
        { tipo: "multiselect", id: "ms-ram", valores: ["Automóvel - Casco"] },
        { tipo: "multiselect", id: "ms-seg", valores: ["Porto Seguro"] },
      ],
    },
  ];
}

// Cenários específicos de cada aba entram nas Tasks 14–22.
export const CENARIOS: Cenario[] = [
  ...ABAS_PRODUCAO.flatMap(cenariosDaAba),
  {
    nome: "retencao-periodo", aba: "retencao",
    passos: [
      { tipo: "preencher", id: "ret-per-s", valor: "2026-04-01" },
      { tipo: "preencher", id: "ret-per-e", valor: "2026-09-30" },
    ],
  },
  { nome: "sinistros-padrao", aba: "sinistros", passos: [] },
  { nome: "exibicao-tv-padrao", aba: "exibicao-tv", passos: [] },
  {
    nome: "apresentacao-padrao", aba: "apresentacao",
    passos: [
      { tipo: "preencher", id: "f-vig-s", valor: "2026-10-01" },
      { tipo: "preencher", id: "f-vig-e", valor: "2026-10-31" },
    ],
  },
];
