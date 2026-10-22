// Sem imports: o painel de fontes (cliente) lê estas constantes sem puxar o xlsx para o bundle inicial.
export const SAUDE_FILE = 'saude_fernando.xlsx';

// Ordem das colunas do modelo baixado pelo painel Fontes. PARCELA (valor mensal),
// QTD. PARCELAS, % AGENCIAMENTO e % COMISSÃO alimentam as fórmulas da própria
// planilha — o dash não as lê.
export const SAUDE_MODELO = ['APÓLICE', 'CLIENTE', 'CPF/CNPJ', 'SEGURADORA', 'INÍCIO DE VIGÊNCIA', 'DATA EMISSÃO',
  'TIPO DE NEGÓCIO', 'COLABORADOR', 'PARCELA', 'QTD. PARCELAS', '% AGENCIAMENTO', '% COMISSÃO',
  'PRÊMIO LÍQUIDO', 'AGENCIAMENTO R$', 'COMISSÃO R$', 'TOTAL RECEBIDO'];
