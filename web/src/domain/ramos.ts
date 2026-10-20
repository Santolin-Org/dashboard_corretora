// Classificação de ramos para a aba Metas.
// normRamo: maiúsculas, sem acento, espaços colapsados — tolera variações de grafia da planilha.
export const normRamo = (s: unknown): string => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
// Nomenclatura oficial de ramos adotada pela corretora. A base do Quiver ainda
// traz uma minoria de apólices legadas com o nome antigo (a serem corrigidas no
// próprio Quiver); aqui só unificamos variações de CAIXA/acento do mesmo ramo —
// ex.: 'ODONTOLÓGICO - COLETIVO' e 'Odontológico - Coletivo' contam como um só.
export const RAMOS_OFICIAIS: string[] = [
  'Acidentes Pessoais',
  'Acidentes Pessoais - Coletivo',
  'Automóvel - Casco',
  'Carta Verde',
  'Compreensivo Condomínio',
  'Compreensivo Empresarial',
  'Compreensivo Residencial',
  'Educacional Individual',
  'Eventos Aleatórios',
  'Eventos Aleatórios - Coletivo',
  'Garantia Segurado - Setor Público',
  'Marítimos (Casco)',
  'Microsseguros de Previdência',
  // Único ramo ainda em caixa alta no Quiver. Quando migrarem, basta trocar por
  // 'Odontológico - Coletivo' — as duas grafias já resolvem para o mesmo ramo.
  'ODONTOLÓGICO - COLETIVO',
  'Responsabilidade Civil de Administradores e Diretores - D&O',
  'Responsabilidade Civil Facultativa Veículos - RCFV',
  'Responsabilidade Civil Geral',
  'Responsabilidade Civil Profissional',
  'Riscos de Engenharia',
  'Riscos Diversos',
  'Saúde',
  'Seguro Viagem Individual',
  'Transporte Nacional',
  'Vida',
  'Vida em Grupo',
  'Vida Individual',
];
const RAMO_CANON = new Map<string, string>(RAMOS_OFICIAIS.map(r => [normRamo(r), r]));
// Devolve o nome oficial quando o ramo bate por caixa/acento; senão preserva o
// texto original (legado ou ainda não catalogado) para não mascarar a base.
export const canonRamo = (ramo: unknown): string => RAMO_CANON.get(normRamo(ramo)) || String(ramo || '').trim();

// Ramos que NÃO entram na contagem da meta (match por trecho normalizado).
// 'VGBL' e 'EDUCACIONAL' entraram com a nomenclatura nova; 'PREVIDENCIA' cobre
// 'Microsseguros de Previdência'.
export const META_EXCLUDED_KEYS: string[] = ['VIAGEM', 'CARTA VERDE', 'ACIDENTES PESSOAIS', 'PREVIDENCIA', 'VGBL',
  'EVENTOS ALEATORIOS', 'TRANSPORTE NACIONAL', 'EDUCACIONAL'];
// Ramos da equipe Pessoal; os demais não-excluídos caem em Patrimonial.
// As chaves 'RC ...' cobrem as apólices legadas até o Quiver ser corrigido.
export const META_PESSOAIS_KEYS: string[] = ['VIDA', 'SAUDE', 'ODONTO',
  'RESPONSABILIDADE CIVIL PROFISSIONAL', 'RESPONSABILIDADE CIVIL GERAL',
  'ADMINISTRADORES E DIRETORES', 'D&O',
  'RC PROFISSIONAL', 'RC GERAL', 'RC ADMINISTRADORES'];

// Rótulos curtos para os eixos dos gráficos por ramo (chave = ramo normalizado).
const RAMO_SHORT: Record<string, string> = {
  'AUTOMOVEL - CASCO': 'Auto — casco',
  'COMPREENSIVO RESIDENCIAL': 'Comp. residencial',
  'COMPREENSIVO EMPRESARIAL': 'Comp. empresarial',
  'COMPREENSIVO CONDOMINIO': 'Comp. condomínio',
  'RESPONSABILIDADE CIVIL PROFISSIONAL': 'RC profissional',
  'RESPONSABILIDADE CIVIL GERAL': 'RC geral',
  'RESPONSABILIDADE CIVIL FACULTATIVA VEICULOS - RCFV': 'RCF veículos',
  'RESPONSABILIDADE CIVIL DE ADMINISTRADORES E DIRETORES - D&O': 'RC D&O',
  'GARANTIA SEGURADO - SETOR PUBLICO': 'Garantia setor púb.',
  'MICROSSEGUROS DE PREVIDENCIA': 'Microsseg. previd.',
  'ACIDENTES PESSOAIS - COLETIVO': 'Ac. pessoais colet.',
  'EVENTOS ALEATORIOS - COLETIVO': 'Ev. aleatórios colet.',
  'ODONTOLOGICO - COLETIVO': 'Odontológico colet.',
  'SEGURO VIAGEM INDIVIDUAL': 'Viagem individual',
  'TRANSPORTE NACIONAL': 'Transporte nac.',
  'RISCOS DE ENGENHARIA': 'Riscos engenharia',
  // Legados sem par oficial — só até o Quiver ser corrigido.
  'RC PROFISSIONAL': 'RC profissional',
  'RCF VEICULOS RCFV': 'RCF veículos',
  'VGBL/VAGP/VRGP/VRSA/VRI': 'Previdência VGBL',
};
// Abrevia o ramo para os gráficos; sem entrada no mapa, devolve o nome oficial
// em caixa de sentença.
export const shortRamo = (n: unknown): string => RAMO_SHORT[normRamo(n)]
  || String(n || '').toLowerCase().replace(/^\w/, c => c.toUpperCase());
// → 'excluded' | 'pessoais' | 'patrimoniais'
export function classifyRamo(ramo: unknown): 'excluded' | 'pessoais' | 'patrimoniais' {
  const n = normRamo(ramo);
  if (META_EXCLUDED_KEYS.some(k => n.includes(k))) return 'excluded';
  if (META_PESSOAIS_KEYS.some(k => n.includes(k))) return 'pessoais';
  return 'patrimoniais';
}

// Produção da meta = N, R, EN, ER (mesma definição do resto do dashboard).
// O lado "novos" agrega N + endosso novo; "renovações" agrega R + endosso renovação.
export function metaTipoSide(tipo: string): 'N' | 'R' | null {
  if (tipo === 'N' || tipo === 'EN') return 'N';
  if (tipo === 'R' || tipo === 'ER') return 'R';
  return null; // CN, CR e demais não entram na base da meta
}
