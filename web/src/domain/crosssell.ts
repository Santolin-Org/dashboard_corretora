// Aba Cross-sell (main.js 2143–2656) e a exportação 'crosssell' do exportData: cálculos puros, sem DOM.
// Regras de negócio em METRICAS.md; o main.js é a referência. A aba lê `ALL` inteiro (base.linhas):
// os filtros globais do cabeçalho não valem nela, só os filtros próprios (pessoa, ramo, colaborador, busca).
import type { Linha } from './tipos';
import { instanteDeDataISO } from './datas';
import { normRamo } from './ramos';
import { saudeFaturaConta, SEM_FILTRO_TIPO } from './saude/aplicar';
import { fBRL, fN, fP } from './formatos';

// ── Campanha SANTOLIN 360 ─────────────────────────────────────────────────────
// Meta de 3 fases para o 3º trimestre de 2026.
// Conta apólices (não endosso/fatura) com CAMPANHA = "SANTOLIN 360" e início de
// vigência dentro do trimestre, independente dos filtros de PF/PJ/ramo/colaborador
// da aba (é uma meta única da empresa, não recorta por segmento).
export const CAMPANHA_360_NOME = 'SANTOLIN 360';
export const CAMPANHA_360_INICIO = '2026-07-01';
export const CAMPANHA_360_FIM = '2026-09-30';
export const CAMPANHA_360_FASES_QTD = [120, 150, 180];
export const CAMPANHA_360_FASES_COM = [77000, 97000, 115000];

export function getCampanha360Rows(todas: Linha[]): Linha[] {
  const alvo = normRamo(CAMPANHA_360_NOME);
  return todas.filter(r =>
    r.tipoDoc === 'APÓLICE' &&
    normRamo(r.campanha) === alvo &&
    r.vig && r.vig >= CAMPANHA_360_INICIO && r.vig <= CAMPANHA_360_FIM
  );
}

export type MarcadorFase = { pos: number; atingida: boolean; fase: number; valor: string };
export type MetaFases = { label: string; valor: string; metaFinal: string; larguraPct: string; marcadores: MarcadorFase[]; badge: string };

// renderTierGoal
export function metaFases(label: string, valor: number, fases: number[], formatador: (v: number) => string): MetaFases {
  const metaFinal = fases[fases.length - 1];
  const pct = metaFinal > 0 ? Math.min(1, valor / metaFinal) : 0;
  const faseAtual = fases.filter(f => valor >= f).length;
  const marcadores = fases.map((f, i) => ({
    pos: metaFinal > 0 ? Math.min(100, (f / metaFinal) * 100) : 0,
    atingida: valor >= f,
    fase: i + 1,
    valor: formatador(f),
  }));
  return {
    label, valor: formatador(valor), metaFinal: formatador(metaFinal), larguraPct: (pct * 100).toFixed(2), marcadores,
    badge: faseAtual > 0 ? 'Fase ' + faseAtual + ' de ' + fases.length + ' concluída' : 'Nenhuma fase concluída ainda',
  };
}

// Top 3 colaboradores por apólices vendidas ou por comissão, dentro da campanha.
export type RankCampanha = { colab: string; qtd: number; comissao: number };
export function getCampanha360Ranking(rows: Linha[], metric: 'qtd' | 'comissao'): RankCampanha[] {
  const map = new Map<string, RankCampanha>();
  rows.forEach(r => {
    const k = r.colab || 'Sem identificação';
    if (!map.has(k)) map.set(k, { colab: k, qtd: 0, comissao: 0 });
    const c = map.get(k)!;
    c.qtd++;
    c.comissao += r.com;
  });
  return [...map.values()].sort((a, b) => b[metric] - a[metric]).slice(0, 3);
}

export type Campanha360 = { metas: MetaFases[]; podios: { titulo: string; nomes: [string, string, string] }[] };
// renderCrossCampanha360. `nomes` em ordem de ranking: 1º, 2º, 3º ('—' sem colocado).
export function campanha360(todas: Linha[]): Campanha360 {
  const rows = getCampanha360Rows(todas);
  const qtd = rows.length;
  const comissao = rows.reduce((s, r) => s + r.com, 0);
  const nomes = (t: RankCampanha[]): [string, string, string] => [0, 1, 2].map(i => t[i] ? t[i].colab : '—') as [string, string, string];
  return {
    metas: [
      metaFases('Apólices vendidas', qtd, CAMPANHA_360_FASES_QTD, fN),
      metaFases('Comissão gerada', comissao, CAMPANHA_360_FASES_COM, fBRL),
    ],
    podios: [
      { titulo: 'Top 3 — Apólices vendidas', nomes: nomes(getCampanha360Ranking(rows, 'qtd')) },
      { titulo: 'Top 3 — Comissão gerada', nomes: nomes(getCampanha360Ranking(rows, 'comissao')) },
    ],
  };
}

// ── Filtros próprios (CROSS, crossSearch) ─────────────────────────────────────
export type Pessoa = 'PF' | 'PJ';
// Ramos principais da corretora, pré-ativados por padrão no filtro de ramo do
// Cross-sell (match por trecho normalizado, mesmo critério de classifyRamo).
// Demais ramos ficam disponíveis no filtro para o usuário ativar manualmente.
export const CROSS_MAIN_RAMOS: Record<Pessoa, string[]> = {
  PF: ['VIDA INDIVIDUAL', 'RESPONSABILIDADE CIVIL PROFISSIONAL', 'RC PROFISSIONAL', 'AUTOMOVEL', 'RESIDENCIAL'],
  PJ: ['SAUDE', 'VIDA EM GRUPO', 'EMPRESARIAL', 'RESPONSABILIDADE CIVIL PROFISSIONAL', 'RC PROFISSIONAL'],
};
export function isCrossMainRamo(ramo: string, pessoa: Pessoa): boolean {
  const n = normRamo(ramo);
  return CROSS_MAIN_RAMOS[pessoa].some(k => n.includes(k));
}

/** Estado dos filtros da aba. `ram`/`col` na ordem de marcação (como o Set do antigo); vazio = todos. */
export type FiltrosCross = { pessoa: Pessoa; ram: string[]; col: string[]; busca: string };

export function getCrossRamoUniverse(todas: Linha[], pessoa: Pessoa): string[] {
  return [...new Set(todas.filter(r => r.docDigits && r.tipoPessoa === pessoa && r.sit === 'Ativa' && r.ramo).map(r => r.ramo))].sort();
}
export function opcoesColabCross(todas: Linha[], pessoa: Pessoa): string[] {
  return [...new Set(todas.filter(r => r.docDigits && r.tipoPessoa === pessoa).map(r => r.colab).filter(Boolean))].sort();
}
/** buildCrossFilters: sem ramo marcado, marca os ramos principais da pessoa (carga e troca de pessoa). */
export function ramosPadraoCross(todas: Linha[], pessoa: Pessoa): string[] {
  return getCrossRamoUniverse(todas, pessoa).filter(r => isCrossMainRamo(r, pessoa));
}
/** Estado inicial (topo do main.js: PF, sem colaborador, sem busca; ramos principais por buildCrossFilters). */
export const filtrosCrossIniciais = (todas: Linha[]): FiltrosCross => ({ pessoa: 'PF', ram: ramosPadraoCross(todas, 'PF'), col: [], busca: '' });

export function getCrossRamoList(todas: Linha[], f: FiltrosCross): string[] {
  const universe = getCrossRamoUniverse(todas, f.pessoa);
  const ram = new Set(f.ram);
  return ram.size > 0 ? universe.filter(r => ram.has(r)) : universe;
}

// ── Clientes ──────────────────────────────────────────────────────────────────
export type ClienteCross = {
  doc: string; tipoPessoa: Pessoa; nome: string; ramosAtivos: Set<string>; apolicesAtivas: number; comissaoTotal: number;
  /** Instante (ms) da 1ª vigência histórica; null sem nenhuma vigência. */
  primeiraVig: number | null; colabs: Set<string>;
  anos: number; ltv: number | null;
};

// Agrupa apólices por CPF/CNPJ. LTV = comissão líquida total (já contempla estornos
// CR/CN, que chegam com valor negativo) / anos desde a 1ª vigência histórica do cliente.
export function buildCrossMap(todas: Linha[], pessoa: Pessoa): Map<string, ClienteCross> {
  const map = new Map<string, ClienteCross>();
  todas.forEach(r => {
    if (!r.docDigits || r.tipoPessoa !== pessoa) return;
    let c = map.get(r.docDigits);
    if (!c) {
      c = { doc: r.docDigits, tipoPessoa: pessoa, nome: r.cli, ramosAtivos: new Set(), apolicesAtivas: 0, comissaoTotal: 0, primeiraVig: null, colabs: new Set(), anos: 0, ltv: null };
      map.set(r.docDigits, c);
    }
    if (r.cli) c.nome = r.cli;
    if (saudeFaturaConta(r, SEM_FILTRO_TIPO)) c.comissaoTotal += r.com;
    if (r.colab) c.colabs.add(r.colab);
    if (r.sit === 'Ativa') {
      if (r.tipoDoc === 'APÓLICE') c.apolicesAtivas++; // exclui endossos/faturas, que são alterações da apólice, não novos contratos
      if (r.ramo) c.ramosAtivos.add(r.ramo);
    }
    if (r.vig) {
      const t = r.vigMs ?? instanteDeDataISO(r.vig);
      if (c.primeiraVig === null || t < c.primeiraVig) c.primeiraVig = t;
    }
  });
  return map;
}

const MS_ANO = 365.25 * 86400000;
/**
 * getCrossClients: clientes da pessoa, filtrados por colaborador e busca, com anos e LTV calculados.
 * `agora` = Date.now() do app antigo (ms), passado pela camada de UI para a função ficar pura.
 * É a construção de clientes que a Exibição TV (Task 22) reaproveita (classificação por nível).
 */
export function getCrossClients(todas: Linha[], f: FiltrosCross, agora: number): ClienteCross[] {
  return filtrarClientesCross(buildCrossMap(todas, f.pessoa), f, agora);
}

/**
 * Filtro por colaborador e busca + anos/LTV sobre um mapa já montado por `buildCrossMap` (a parte cara, que a UI guarda
 * por (base, pessoa)). Devolve cópias: o mapa não é alterado e pode alimentar listas de buscas diferentes.
 */
export function filtrarClientesCross(mapa: Map<string, ClienteCross>, f: Pick<FiltrosCross, 'col' | 'busca'>, agora: number): ClienteCross[] {
  let clients = [...mapa.values()];
  if (f.col.length > 0) { const col = new Set(f.col); clients = clients.filter(c => [...c.colabs].some(cl => col.has(cl))); }
  if (f.busca) {
    const s = f.busca.toLowerCase().trim();
    const sDigits = s.replace(/\D/g, '');
    clients = clients.filter(c => c.nome.toLowerCase().includes(s) || (sDigits && c.doc.includes(sDigits)));
  }
  return clients.map(c => {
    const anos = c.primeiraVig !== null ? (agora - c.primeiraVig) / MS_ANO : 0;
    return { ...c, anos, ltv: anos > 1 ? c.comissaoTotal / anos : null };
  });
}

// Nível de relacionamento por quantidade de apólices ativas do cliente.
export const CROSS_NIVEIS = [
  { label: 'Nível 1 — Essencial' },
  { label: 'Nível 2 — Ampliada' },
  { label: 'Nível 3 — Avançada' },
  { label: 'Nível 4 — Plena' },
];
/** Contagem por nível (1, 2, 3, 4+ apólices ativas); quem não tem apólice ativa fica de fora. */
export function contarNiveis(clients: { apolicesAtivas: number }[]): number[] {
  const counts = [0, 0, 0, 0];
  clients.forEach(c => {
    const n = c.apolicesAtivas;
    if (n <= 0) return;
    counts[Math.min(n, 4) - 1]++;
  });
  return counts;
}
export function graficoNivel(clients: ClienteCross[]): { labels: string[]; counts: number[]; total: number; badge: string } {
  const counts = contarNiveis(clients);
  const total = counts.reduce((s, v) => s + v, 0);
  return { labels: CROSS_NIVEIS.map(n => n.label), counts, total, badge: fN(total) + ' clientes' };
}

type StatRamo = { comSum: number; count: number; ticketMedio: number };
// Ticket médio de comissão por ramo: só conta apólices (não endosso/fatura) ativas
// dos clientes filtrados atualmente — mesma base usada no resto da aba.
export function getCrossRamoStats(todas: Linha[], clients: ClienteCross[], ramoList: string[]): Record<string, StatRamo> {
  const docSet = new Set(clients.map(c => c.doc));
  const stats: Record<string, StatRamo> = {};
  ramoList.forEach(r => { stats[r] = { comSum: 0, count: 0, ticketMedio: 0 }; });
  todas.forEach(r => {
    if (!docSet.has(r.docDigits) || r.sit !== 'Ativa' || r.tipoDoc !== 'APÓLICE') return;
    const s = stats[r.ramo];
    if (!s) return;
    s.comSum += r.com; s.count++;
  });
  Object.values(stats).forEach(s => { s.ticketMedio = s.count ? s.comSum / s.count : 0; });
  return stats;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
export type CartaoCross = { l: string; v: string; s: string; c: 'k-teal' | 'k-green' | 'k-purple' | 'k-blue' | 'k-red' | 'k-amber' };
export function kpisCross(todas: Linha[], clients: ClienteCross[], ramoList: string[]): CartaoCross[] {
  const totalDocsAll = new Set(todas.filter(r => r.docDigits).map(r => r.docDigits)).size;
  const comissaoTotal = clients.reduce((s, c) => s + c.comissaoTotal, 0);
  const withLtv = clients.filter(c => c.ltv != null);
  const ltvMedio = withLtv.length ? withLtv.reduce((s, c) => s + (c.ltv as number), 0) / withLtv.length : 0;

  let maisPopular = { ramo: '—', pct: 0 }, maiorOportunidade = { ramo: '—', valor: 0 };
  let maiorLtvRamo = { ramo: '—', valor: 0 };
  if (clients.length && ramoList.length) {
    const stats = getCrossRamoStats(todas, clients, ramoList);
    ramoList.forEach(ramo => {
      const has = clients.filter(c => c.ramosAtivos.has(ramo)).length;
      const pct = has / clients.length;
      if (pct > maisPopular.pct) maisPopular = { ramo, pct };
      // Oportunidade de comissão = clientes sem o ramo × ticket médio de comissão do ramo.
      const valor = (clients.length - has) * stats[ramo].ticketMedio;
      if (valor > maiorOportunidade.valor) maiorOportunidade = { ramo, valor };
      // LTV médio dos clientes que possuem este ramo (só quem tem LTV calculável, >1 ano).
      const clientesRamoComLtv = withLtv.filter(c => c.ramosAtivos.has(ramo));
      if (clientesRamoComLtv.length) {
        const ltvMedioRamo = clientesRamoComLtv.reduce((s, c) => s + (c.ltv as number), 0) / clientesRamoComLtv.length;
        if (ltvMedioRamo > maiorLtvRamo.valor) maiorLtvRamo = { ramo, valor: ltvMedioRamo };
      }
    });
  }

  // Tempo médio de permanência: só entra quem tem 1ª vigência registrada (não distorce com fallback de dado ausente).
  const withVig = clients.filter(c => c.primeiraVig !== null);
  const tempoMedio = withVig.length ? withVig.reduce((s, c) => s + c.anos, 0) / withVig.length : 0;

  return [
    { l: 'Total de clientes', v: fN(clients.length), s: fN(totalDocsAll) + ' no total (PF+PJ)', c: 'k-teal' },
    { l: 'Comissão total (LTV)', v: fBRL(comissaoTotal), s: fN(ramoList.length) + ' ramos mapeados', c: 'k-green' },
    { l: 'LTV médio por cliente', v: fBRL(ltvMedio), s: fN(withLtv.length) + ' c/ histórico >1 ano', c: 'k-purple' },
    { l: 'Ramo mais popular', v: maisPopular.ramo, s: fP(maisPopular.pct) + ' dos clientes', c: 'k-blue' },
    { l: 'Maior oportunidade', v: maiorOportunidade.ramo, s: fBRL(maiorOportunidade.valor) + ' em comissão potencial', c: 'k-red' },
    { l: 'Ramo com maior LTV', v: fBRL(maiorLtvRamo.valor), s: maiorLtvRamo.ramo, c: 'k-amber' },
    { l: 'Tempo médio de permanência', v: tempoMedio.toFixed(1).replace('.', ',') + ' anos', s: fN(withVig.length) + ' clientes na base', c: 'k-teal' },
  ];
}

// ── Penetração / oportunidade por ramo ────────────────────────────────────────
export type ModoPen = 'penetracao' | 'oportunidade';
export type LinhaPen =
  | { modo: 'penetracao'; ramo: string; larguraYes: string; txtYes: string; txtNo: string }
  | { modo: 'oportunidade'; ramo: string; largura: string; txt: string };
export function penetracaoCross(todas: Linha[], clients: ClienteCross[], ramoList: string[], modo: ModoPen): { titulo: string; vazio: boolean; linhas: LinhaPen[] } {
  const total = clients.length;
  const isOpp = modo === 'oportunidade';
  const titulo = isOpp ? 'Oportunidade de comissão por ramo' : 'Penetração por ramo';
  if (!ramoList.length || !total) return { titulo, vazio: true, linhas: [] };

  const base = ramoList.map(ramo => {
    const has = clients.filter(c => c.ramosAtivos.has(ramo)).length;
    return { ramo, has, not: total - has, pctHas: has / total };
  });

  if (isOpp) {
    const stats = getCrossRamoStats(todas, clients, ramoList);
    const rows = base.map(r => {
      const ticketMedio = stats[r.ramo].ticketMedio;
      return { ...r, ticketMedio, oportunidade: r.not * ticketMedio };
    }).sort((a, b) => b.oportunidade - a.oportunidade);
    const maxOp = rows.length ? rows[0].oportunidade : 0;
    return {
      titulo, vazio: false,
      linhas: rows.map(r => ({
        modo: 'oportunidade' as const, ramo: r.ramo,
        largura: maxOp > 0 ? (r.oportunidade / maxOp * 100).toFixed(2) : '0',
        txt: `${fBRL(r.oportunidade)} · ${fN(r.not)} sem × ${fBRL(r.ticketMedio)}`,
      })),
    };
  }

  const rows = base.sort((a, b) => b.pctHas - a.pctHas);
  return {
    titulo, vazio: false,
    linhas: rows.map(r => ({
      modo: 'penetracao' as const, ramo: r.ramo, larguraYes: (r.pctHas * 100).toFixed(2),
      txtYes: `✅ ${fN(r.has)} (${fP(r.pctHas)})`, txtNo: `❌ ${fN(r.not)} (${fP(1 - r.pctHas)})`,
    })),
  };
}

// ── Tabela de clientes ────────────────────────────────────────────────────────
export const CROSS_PAGE_SIZE = 50;
export type ChaveOrdemCross = 'nome' | 'apolicesAtivas' | 'ltv';
export type OrdemCross = { chave: ChaveOrdemCross; dir: 'asc' | 'desc' };
/** Valores iniciais do topo do main.js: crossSortKey = 'ltv', crossSortDir = 'desc'. */
export const ORDEM_CROSS_INICIAL: OrdemCross = { chave: 'ltv', dir: 'desc' };
/** setCrossSort: mesma chave inverte a direção; outra chave começa asc para nome e desc para as demais. */
export function alternarOrdemCross(o: OrdemCross, chave: ChaveOrdemCross): OrdemCross {
  if (o.chave === chave) return { chave, dir: o.dir === 'desc' ? 'asc' : 'desc' };
  return { chave, dir: chave === 'nome' ? 'asc' : 'desc' };
}

export function ordenarCross(clients: ClienteCross[], o: OrdemCross): ClienteCross[] {
  const rows = [...clients];
  rows.sort((a, b) => {
    let va: string | number, vb: string | number;
    if (o.chave === 'ltv') { va = a.ltv ?? -Infinity; vb = b.ltv ?? -Infinity; }
    else if (o.chave === 'nome') { va = a.nome; vb = b.nome; }
    else { va = a[o.chave]; vb = b[o.chave]; }
    if (typeof va === 'string') return o.dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return o.dir === 'asc' ? va - (vb as number) : (vb as number) - va;
  });
  return rows;
}

/** formatDoc */
export function formatDoc(digits: string, tipoPessoa: string): string {
  if (!digits) return '—';
  if (tipoPessoa === 'PF' && digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (tipoPessoa === 'PJ' && digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}

export type LinhaTabelaCross = { nome: string; doc: string; ramos: boolean[]; apolicesAtivas: string; ltv: string };
export type TabelaCross = {
  badge: string; linhas: LinhaTabelaCross[]; total: number; pagina: number; totalPaginas: number; inicio: number; naPagina: number;
};
/** renderCrossTable + paginateCrossRows. `pagina` é limitada a [1, totalPaginas]. */
export function tabelaCross(clients: ClienteCross[], ramoList: string[], o: OrdemCross, pagina: number): TabelaCross {
  const rows = ordenarCross(clients, o);
  const totalPaginas = Math.max(1, Math.ceil(rows.length / CROSS_PAGE_SIZE));
  let pg = pagina;
  if (pg > totalPaginas) pg = totalPaginas;
  if (pg < 1) pg = 1;
  const inicio = (pg - 1) * CROSS_PAGE_SIZE;
  const pageRows = rows.slice(inicio, inicio + CROSS_PAGE_SIZE);
  return {
    badge: fN(rows.length) + ' clientes', total: rows.length, pagina: pg, totalPaginas, inicio, naPagina: pageRows.length,
    linhas: pageRows.map(c => ({
      nome: c.nome, doc: formatDoc(c.doc, c.tipoPessoa), ramos: ramoList.map(r => c.ramosAtivos.has(r)),
      apolicesAtivas: fN(c.apolicesAtivas), ltv: c.ltv == null ? '—' : fBRL(c.ltv),
    })),
  };
}

/** exportData('crosssell'): todos os clientes filtrados (na ordem do mapa, sem a ordenação da tabela). */
export function exportacaoCross(clients: ClienteCross[], ramoList: string[]): Record<string, string | number>[] {
  return clients.map(c => {
    const row: Record<string, string | number> = { 'Nome': c.nome, 'CPF/CNPJ': formatDoc(c.doc, c.tipoPessoa) };
    ramoList.forEach(r => { row[r] = c.ramosAtivos.has(r) ? 'Sim' : 'Não'; });
    row['Apólices ativas'] = c.apolicesAtivas;
    row['LTV'] = c.ltv == null ? '' : c.ltv;
    return row;
  });
}
