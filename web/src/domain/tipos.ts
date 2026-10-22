export type DataISO = string; // 'YYYY-MM-DD' ou '' (vazia)

export type Linha = {
  tipo: string; vig: DataISO; em: DataISO; fim: DataISO; cli: string; seg: string; ramo: string; grp: string;
  premio: number; com: number; colab: string; sit: string; motivo: string; cancel: DataISO;
  docDigits: string; tipoPessoa: 'PF' | 'PJ' | ''; tipoDoc: string; campanha: string; apolice: string; endosso: string;
  /** Data civil LOCAL (São Paulo) do Date do app antigo, só quando difere de vig/em (ver dataLocalDeCelula). */
  vigLocal?: DataISO; emLocal?: DataISO;
  /** Instante (ms) exato do Date de r.vig do app antigo; só o Cross-sell usa (tempo desde a 1ª vigência). Ausente em linhas que não vêm da produção (saúde criada à parte). */
  vigMs?: number;
  trocaSeg: boolean; saudeManual?: boolean; saudeFaturaDe?: string; // preenchidos pelos enriquecimentos (Task 4)
};
