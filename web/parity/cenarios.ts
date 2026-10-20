export type AbaId =
  | "visao-geral" | "producao" | "retencao" | "crosssell" | "comparativo" | "metas" | "sinistros"
  | "exibicao-tv" | "apresentacao";

export type Passo =
  | { tipo: "preencher"; id: string; valor: string } // input date/text: define value e dispara 'change'
  | { tipo: "clicar"; seletor: string }
  | { tipo: "multiselect"; id: "ms-col" | "ms-grp" | "ms-ram" | "ms-seg" | "ms-ret-col" | "ms-ret-ram" | "ms-ret-grp" | "ms-ret-mot"; valores: string[] };

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
  {
    nome: "retencao-vazio", aba: "retencao", // período sem nenhuma apólice: tabelas vazias, sem gráfico de motivos
    passos: [
      { tipo: "preencher", id: "ret-per-s", valor: "2030-01-01" },
      { tipo: "preencher", id: "ret-per-e", valor: "2030-12-31" },
    ],
  },
  { nome: "retencao-so-evitavel-off", aba: "retencao", passos: [{ tipo: "clicar", seletor: "#ret-evitavel-btn" }] },
  // O detalhe não tem busca por texto: `retDetailFilter` é o filtro de situação (Todas/Canceladas/Vencidas).
  { nome: "retencao-detalhe-busca", aba: "retencao", passos: [{ tipo: "clicar", seletor: "#ret-filter-canc-btn" }] },
  { nome: "retencao-detalhe-vencidas", aba: "retencao", passos: [{ tipo: "clicar", seletor: "#ret-filter-venc-btn" }] },
  { nome: "retencao-motivo", aba: "retencao", passos: [{ tipo: "multiselect", id: "ms-ret-mot", valores: ["Insatisfação com atendimento"] }] },
  {
    nome: "retencao-filtros-proprios", aba: "retencao",
    passos: [
      { tipo: "multiselect", id: "ms-ret-col", valores: ["CARLA NOGUEIRA"] },
      { tipo: "multiselect", id: "ms-ret-ram", valores: ["Responsabilidade Civil Geral"] },
      { tipo: "clicar", seletor: "#ret-tipo-R" },
    ],
  },
  { nome: "retencao-grupo", aba: "retencao", passos: [{ tipo: "clicar", seletor: 'label[for="vt-ret-grp"]' }] },
  {
    nome: "retencao-ordenacao", aba: "retencao",
    passos: [{ tipo: "clicar", seletor: "#ret-prod-table-wrap th:nth-child(5)" }, { tipo: "clicar", seletor: "#ret-prod-table-wrap th:nth-child(1)" }],
  },
  {
    nome: "retencao-todos-evitaveis-canc", aba: "retencao",
    passos: [{ tipo: "clicar", seletor: "#ret-evitavel-btn" }, { tipo: "clicar", seletor: "#ret-filter-canc-btn" }, { tipo: "clicar", seletor: "#ret-tipo-N" }],
  },
  {
    nome: "visao-geral-motivo", aba: "visao-geral",
    passos: [
      { tipo: "clicar", seletor: "#cancel-filter .cancel-filter-header" }, // abre a lista de motivos
      { tipo: "clicar", seletor: "#cancel-filter .cancel-filter-footer button:nth-child(2)" }, // Desmarcar todos
      { tipo: "clicar", seletor: "#cb-Pre_o" }, // marca só "Preço"
    ],
  },
  {
    nome: "visao-geral-comissao", aba: "visao-geral",
    passos: [
      { tipo: "clicar", seletor: 'label[for="mt-evol-c"]' },
      { tipo: "clicar", seletor: 'label[for="mt-seg-c"]' },
      { tipo: "clicar", seletor: 'label[for="mt-ramo-c"]' },
    ],
  },
  {
    nome: "producao-metrica-comissao", aba: "producao",
    passos: [{ tipo: "clicar", seletor: 'label[for="mt-prod-c"]' }],
  },
  {
    nome: "producao-periodos", aba: "producao",
    passos: [
      { tipo: "preencher", id: "period-start", valor: "2026-01-01" },
      { tipo: "preencher", id: "period-end", valor: "2026-03-31" },
      { tipo: "clicar", seletor: '#tab-producao .period-row button.btn-sm:nth-of-type(1)' }, // + Adicionar
      { tipo: "preencher", id: "period-start", valor: "2025-07-01" },
      { tipo: "preencher", id: "period-end", valor: "2025-12-31" },
      { tipo: "clicar", seletor: '#tab-producao .period-row button.btn-sm:nth-of-type(1)' },
    ],
  },
  {
    nome: "producao-ordenacao", aba: "producao",
    passos: [
      { tipo: "clicar", seletor: '#prod-table-wrap th:nth-child(3)' }, // Prêmio líquido (1º clique: já é o padrão, desc -> asc)
      { tipo: "clicar", seletor: '#prod-table-wrap th:nth-child(3)' },
    ],
  },
  { nome: "producao-ordenacao-asc", aba: "producao", passos: [{ tipo: "clicar", seletor: "#prod-table-wrap th:nth-child(3)" }] },
  { nome: "producao-ordenacao-nome", aba: "producao", passos: [{ tipo: "clicar", seletor: "#prod-table-wrap th:nth-child(2)" }] },
  { nome: "producao-grupo", aba: "producao", passos: [{ tipo: "clicar", seletor: 'label[for="vt-grp"]' }] },
  { nome: "producao-metrica-tabela", aba: "producao", passos: [{ tipo: "clicar", seletor: 'label[for="mt-tbl-p"]' }] },
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
