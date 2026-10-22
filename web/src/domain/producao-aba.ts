// Aba Produção (main.js "PRODUÇÃO TAB", 1675–1775) e exportExecutiveSummary: cálculos puros, sem DOM.
// Cada função recebe as linhas já filtradas (FD) e os parâmetros dos controles da aba.
import type { DataISO, Linha } from './tipos';
import { fBRL, fN, fP, fPct } from './formatos';
import { SEM_FILTRO_TIPO, saudeFaturaConta } from './saude/aplicar';
import { campoDaMetrica, evolucaoMensal, MESES_ROTULOS, type Metrica } from './visao-geral';

/** getViewKey(): rádio `vt` — 'grp' ou (qualquer outro valor) 'colab'. */
export type Visao = 'colab' | 'grp';
/** getViewLabel() */
export const rotuloVisao = (v: Visao): string => (v === 'grp' ? 'Grupo de produção' : 'Colaborador');

export type LinhaProd = {
  nome: string; premio: number; com: number; qtd: number; ticket: number; pctCom: number; pctTotal: number; cliCount: number;
};

/** buildProdData: agrega por colaborador/grupo. `metricaTabela` = rádio mt-tbl (decide a base do % de participação). */
export function buildProdData(data: Linha[], visao: Visao, metricaTabela: Metrica): LinhaProd[] {
  const key = visao; const map: Record<string, { nome: string; premio: number; com: number; qtd: number; clis: Set<string> }> = {};
  data.forEach(r => {
    const k = r[key] || 'Sem identificação';
    if (!map[k]) map[k] = { nome: k, premio: 0, com: 0, qtd: 0, clis: new Set() };
    map[k].premio += r.premio; map[k].com += r.com; map[k].qtd++;
    if (r.cli) map[k].clis.add(r.cli);
  });
  const totalPremio = Object.values(map).reduce((s, v) => s + v.premio, 0);
  const totalCom = Object.values(map).reduce((s, v) => s + v.com, 0);
  const metric = metricaTabela;
  const totalEscolhido = metric === 'comissao' ? totalCom : totalPremio;
  return Object.values(map).map(v => ({
    nome: v.nome, premio: v.premio, com: v.com, qtd: v.qtd,
    ticket: v.qtd ? v.premio / v.qtd : 0, pctCom: v.premio ? v.com / v.premio : 0,
    pctTotal: totalEscolhido ? (metric === 'comissao' ? v.com : v.premio) / totalEscolhido : 0, cliCount: v.clis.size,
  }));
}

function calcDestaque(rows: LinhaProd[], mpv: number, mcv: number, mpcv: number, mqv: number): { nome: string; ticket: number; score: number } | null {
  const scored = rows.map(r => ({ nome: r.nome, ticket: r.ticket, score: (r.premio === mpv ? .30 : 0) + (r.com === mcv ? .40 : 0) + (r.pctCom === mpcv ? .10 : 0) + (r.qtd === mqv ? .20 : 0) }));
  if (!scored.length) return null;
  return scored.reduce((a, b) => b.score > a.score ? b : b.score === a.score && b.ticket > a.ticket ? b : a);
}

// Máximos por coluna (Math.max sobre as linhas AGREGADAS: no máximo uma por colaborador/grupo).
const maxDe = (rows: LinhaProd[], f: (r: LinhaProd) => number, piso?: number): number =>
  rows.reduce((m, r) => Math.max(m, f(r)), piso ?? -Infinity);

export type CartaoProd = { rotulo: string; valor: string; sub: string; cor: 'k-blue' | 'k-green' | 'k-purple' | 'k-teal' | 'k-amber'; fonte: '15px' | '20px' };

/** renderProdKPIs. */
export function cartoesProducao(fd: Linha[], visao: Visao): { cartoes: CartaoProd[]; rotuloVisao: string } {
  const d = fd, premio = d.reduce((s, r) => s + r.premio, 0), com = d.reduce((s, r) => s + r.com, 0);
  const withP = d.filter(r => r.premio > 0), ticket = withP.length ? withP.reduce((s, r) => s + r.premio, 0) / withP.length : 0;
  const rows = buildProdData(d, visao, 'premio'), avgCom = premio ? com / premio : 0;
  const mpv = maxDe(rows, r => r.premio), mcv = maxDe(rows, r => r.com), mpcv = maxDe(rows, r => r.pctCom), mqv = maxDe(rows, r => r.qtd);
  const label = rotuloVisao(visao);
  const destaque = calcDestaque(rows, mpv, mcv, mpcv, mqv);
  const k: Omit<CartaoProd, 'fonte'>[] = [
    { rotulo: 'Prêmio total', valor: fBRL(premio), sub: fN(d.length) + ' apólices', cor: 'k-blue' },
    { rotulo: 'Comissão total', valor: fBRL(com), sub: fP(avgCom) + ' do prêmio', cor: 'k-green' },
    { rotulo: 'Ticket médio', valor: fBRL(ticket), sub: fN(withP.length) + ' c/ prêmio', cor: 'k-purple' },
    { rotulo: label + 's ativos', valor: fN(rows.length), sub: 'na seleção atual', cor: 'k-teal' },
    { rotulo: 'Destaque', valor: destaque?.nome?.split(' - ')[0]?.trim()?.split(' ')?.slice(0, 2)?.join(' ') || '—', sub: destaque ? (destaque.score * 100).toFixed(0) + ' pontos' : '—', cor: 'k-amber' },
    { rotulo: 'Com. média %', valor: fP(avgCom), sub: 'comissão / prêmio', cor: 'k-green' },
  ];
  return { cartoes: k.map(c => ({ ...c, fonte: c.valor.length > 10 ? '15px' : '20px' })), rotuloVisao: label };
}

// ── Períodos do gráfico de evolução ───────────────────────────────────────────
export const PERIOD_COLORS = ['#378ADD', '#639922', '#E24B4A', '#BA7517', '#534AB7', '#1D9E75', '#D4537E'];
export type Periodo = { start: DataISO; end: DataISO; label: string; color: string };

/** Mensagem do alert de addPeriod, ou null se o período pode ser adicionado. */
export function validarPeriodo(periodos: Periodo[], s: string, e: string): string | null {
  if (!s || !e) return 'Selecione data de início e fim.';
  if (s > e) return 'Início deve ser anterior ao fim.';
  if (periodos.length >= 7) return 'Máximo 7 períodos.';
  return null;
}
/** addPeriod (depois da validação). */
export function adicionarPeriodo(periodos: Periodo[], s: string, e: string): Periodo[] {
  const fmt = (d: string) => { const [y, m] = d.split('-'); return MESES_ROTULOS[+m - 1] + '/' + y.slice(2); };
  return [...periodos, { start: s, end: e, label: `${fmt(s)} → ${fmt(e)}`, color: PERIOD_COLORS[periodos.length % PERIOD_COLORS.length] }];
}
/** removePeriod: as cores voltam a seguir a posição. */
export function removerPeriodo(periodos: Periodo[], i: number): Periodo[] {
  return periodos.filter((_, j) => j !== i).map((p, idx) => ({ ...p, color: PERIOD_COLORS[idx % PERIOD_COLORS.length] }));
}

export type SerieProducao = {
  rotulos: string[];
  datasets: { label: string; data: number[]; cor: string; tipo: 'atual' | 'anterior' | 'periodo' }[];
  /** Conteúdo de #period-legend: itens com bolinha (cor) e, no modo ano a ano, a nota final sem bolinha. */
  legenda: { cor?: string; texto: string }[];
};

/**
 * renderProdChart. Sem períodos: ano corrente × anterior sobre o FD (por vigência, mês LOCAL).
 * Com períodos: cada janela sobre ALL inteiro (sem os filtros globais), sem as faturas de saúde.
 */
export function serieProducao(fd: Linha[], todas: Linha[], periodos: Periodo[], metrica: Metrica, hoje: DataISO): SerieProducao {
  const field = campoDaMetrica(metrica);
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  if (!periodos.length) {
    const ev = evolucaoMensal(fd, metrica, hoje);
    return {
      rotulos: MESES_ROTULOS,
      datasets: [
        { label: String(ev.anoAtual), data: ev.atual, cor: '#639922', tipo: 'atual' },
        { label: String(ev.anoAnterior), data: ev.anterior, cor: '#E24B4A', tipo: 'anterior' },
      ],
      legenda: [
        { cor: '#639922', texto: `${ev.anoAtual} — atual` },
        { cor: '#E24B4A', texto: `${ev.anoAnterior} — anterior` },
        { texto: '· Adicione períodos para comparar janelas específicas' },
      ],
    };
  }
  return {
    rotulos: MESES_ROTULOS,
    datasets: periodos.map(p => {
      const byMonth: Record<string, number> = {};
      todas.filter(r => r.vig && r.vig >= p.start && r.vig <= p.end && saudeFaturaConta(r, SEM_FILTRO_TIPO)).forEach(r => {
        const m = (r.vigLocal || r.vig).slice(5, 7); // getMonth() local do Date antigo
        byMonth[m] = (byMonth[m] || 0) + r[field];
      });
      return { label: p.label, data: months.map(m => byMonth[m] || 0), cor: p.color, tipo: 'periodo' as const };
    }),
    legenda: periodos.map(p => ({ cor: p.color, texto: p.label })),
  };
}

// ── Tabela ────────────────────────────────────────────────────────────────────
export type ChaveOrdem = 'nome' | 'premio' | 'com' | 'pctCom' | 'ticket' | 'qtd' | 'pctTotal';
export type Ordem = { chave: string; dir: 'asc' | 'desc' };
export const ORDEM_INICIAL: Ordem = { chave: 'premio', dir: 'desc' };

/** setSort: mesma coluna inverte; coluna nova começa em desc. */
export function alternarOrdenacao(o: Ordem, chave: string): Ordem {
  return o.chave === chave ? { chave, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { chave, dir: 'desc' };
}

export type TabelaProducao = {
  badge: string;
  cabecalhos: { chave: ChaveOrdem; rotulo: string; alinhar: 'left' | 'right'; classe: '' | 'sort-asc' | 'sort-desc' }[];
  linhas: {
    posicao: number; nome: string; nomeCompleto: string; premio: string; com: string; pctCom: string; ticket: string; qtd: string;
    pctTotal: string; barraPremio: string; larguraPart: number;
  }[];
  total: { premio: string; com: string; pctCom: string; ticket: string; qtd: string };
};

/** renderProdTable. `metricaTabela` = rádio mt-tbl (base do % de participação). */
export function tabelaProducao(fd: Linha[], visao: Visao, metricaTabela: Metrica, chave: string, dir: 'asc' | 'desc'): TabelaProducao {
  const label = rotuloVisao(visao); const rows = buildProdData(fd, visao, metricaTabela);
  const maxPremio = rows.length ? Math.max(maxDe(rows, r => r.premio), 1) : 1;
  const get = (r: LinhaProd, k: string) => (r as unknown as Record<string, string | number | undefined>)[k] ?? 0;
  rows.sort((a, b) => { const va = get(a, chave), vb = get(b, chave); if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va); return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number); });
  const totPremio = rows.reduce((s, r) => s + r.premio, 0), totCom = rows.reduce((s, r) => s + r.com, 0), totQtd = rows.reduce((s, r) => s + r.qtd, 0);
  const mpv = maxDe(rows, r => r.premio), mcv = maxDe(rows, r => r.com), mpcv = maxDe(rows, r => r.pctCom), mtv = maxDe(rows, r => r.ticket), mqv = maxDe(rows, r => r.qtd);
  const trophy = (val: number, max: number) => val === max ? ' 🏆' : '';
  const cls = (k: string) => k === chave ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
  const col = (k: ChaveOrdem, rotulo: string, alinhar: 'left' | 'right' = 'left') => ({ chave: k, rotulo, alinhar, classe: cls(k) as '' | 'sort-asc' | 'sort-desc' });
  return {
    badge: rows.length + ' ' + label.toLowerCase() + 's',
    cabecalhos: [col('nome', label), col('premio', 'Prêmio líquido', 'right'), col('com', 'Comissão', 'right'), col('pctCom', 'Com. média %', 'right'), col('ticket', 'Ticket médio', 'right'), col('qtd', 'Qtd. apólices', 'right'), col('pctTotal', '% participação', 'right')],
    linhas: rows.map((r, i) => ({
      posicao: i + 1, nome: r.nome.split(' - ')[0].split('|')[0].trim(), nomeCompleto: r.nome,
      premio: fBRL(r.premio) + trophy(r.premio, mpv), com: fBRL(r.com) + trophy(r.com, mcv), pctCom: fPct(r.pctCom) + trophy(r.pctCom, mpcv),
      ticket: fBRL(r.ticket) + trophy(r.ticket, mtv), qtd: fN(r.qtd) + trophy(r.qtd, mqv), pctTotal: fPct(r.pctTotal),
      barraPremio: ((maxPremio ? r.premio / maxPremio : 0) * 100).toFixed(1), larguraPart: Math.round(r.pctTotal * 60),
    })),
    total: { premio: fBRL(totPremio), com: fBRL(totCom), pctCom: fPct(totPremio ? totCom / totPremio : 0), ticket: fBRL(totQtd ? totPremio / totQtd : 0), qtd: fN(totQtd) },
  };
}

// ── Exportações ───────────────────────────────────────────────────────────────
type Celula = string | number | boolean;
/** Campos de cada linha da base do app antigo, na ordem em que o parse os cria (a ordem vira a das colunas). */
function linhaExportada(r: Linha): Record<string, Celula> {
  const o: Record<string, Celula> = {
    tipo: r.tipo, vig: r.vig ? r.vig : '', em: r.em ? r.em : '', fim: r.fim ? r.fim : '', cli: r.cli, seg: r.seg, ramo: r.ramo, grp: r.grp,
    premio: r.premio, com: r.com, colab: r.colab, sit: r.sit, motivo: r.motivo, cancel: r.cancel ? r.cancel : '',
    docDigits: r.docDigits, tipoPessoa: r.tipoPessoa, tipoDoc: r.tipoDoc, campanha: r.campanha, apolice: r.apolice, endosso: r.endosso,
    trocaSeg: r.trocaSeg,
  };
  if (r.saudeManual !== undefined) o.saudeManual = r.saudeManual;
  if (r.saudeFaturaDe !== undefined) o.saudeFaturaDe = r.saudeFaturaDe;
  return o;
}

/** exportExecutiveSummary: as duas planilhas ("Base_Filtrada" e "Producao_Por_Agente"). */
export function resumoExecutivo(fd: Linha[], visao: Visao, metricaTabela: Metrica): { baseFiltrada: Record<string, Celula>[]; producaoPorAgente: Record<string, Celula>[] } {
  return {
    baseFiltrada: fd.map(linhaExportada),
    producaoPorAgente: buildProdData(fd, visao, metricaTabela).map(r => ({ 'Nome': r.nome, 'Prêmio': r.premio, 'Comissão': r.com, 'Ticket': r.ticket, 'Qtd': r.qtd })),
  };
}

/** exportData('producao'): planilha "Producao". */
export function exportacaoProducao(fd: Linha[], visao: Visao, metricaTabela: Metrica): Record<string, Celula>[] {
  return buildProdData(fd, visao, metricaTabela).map(r => ({
    'Nome': r.nome, 'Prêmio': r.premio, 'Comissão': r.com, 'Com. Média %': r.pctCom, 'Ticket Médio': r.ticket, 'Qtd. Apólices': r.qtd,
  }));
}
