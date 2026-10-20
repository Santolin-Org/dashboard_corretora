export type DataISO = string; // 'YYYY-MM-DD' ou '' (vazia)

export type Linha = {
  tipo: string; vig: DataISO; em: DataISO; fim: DataISO; cli: string; seg: string; ramo: string; grp: string;
  premio: number; com: number; colab: string; sit: string; motivo: string; cancel: DataISO;
  docDigits: string; tipoPessoa: 'PF' | 'PJ' | ''; tipoDoc: string; campanha: string; apolice: string; endosso: string;
  trocaSeg: boolean; saudeManual?: boolean; // preenchidos pelos enriquecimentos (Task 4)
};
