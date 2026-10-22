// Exibição TV (main.js 4663–5090): tela cheia dedicada para rodar numa TV. Ignora os filtros globais de propósito —
// é sempre a foto da base inteira (base.linhas), não a seleção que um analista deixou marcada no dashboard.
// Cálculos puros, sem DOM. Regras de negócio em METRICAS.md §6 e §6.1; o main.js é a referência.
import type { DataISO, Linha } from './tipos';
import { addDiasISO, anoISO, instanteDeDataISO, mesISO } from './datas';
import { classifyRamo, normRamo } from './ramos';
import { SIT, isApolice } from './situacoes';
import { ATIVA_VENCIDA_FOLGA_DIAS } from './producao/base';
import { fBRL, fN, fP } from './formatos';
import {
  CAMPANHA_360_NOME, CROSS_NIVEIS, contarNiveis, getCampanha360Ranking, getCampanha360Rows,
  metaFases, type MetaFases,
} from './crosssell';
import { painelTv, type PainelTv } from './paineis-tv';
import { META_TEAMS, METAS_SEM_TEAM_COLOR, METAS_SEM_TEAM_LBL, pctClsMeta, type EquipeMeta } from './metas-semanal';

// Colaboradores fora de todos os gráficos da Exibição TV (pedido específico desta
// tela — não mexe em nenhum outro lugar do dashboard). Compara pelo primeiro nome,
// sem acento/maiúsculas, pra pegar variações de grafia do cadastro.
//
// 'TRANSFERENCIA' não é pessoa: é a pseudo-carteira de transferência de corretagem,
// que entra como produção sem ser venda nova e distorceria a meta. Fica só o
// prefixo (e não 'TRANSFERENCIA CORRETAGEM') para pegar também 'Transferência DE
// Corretagem' e demais variações de cadastro.
export const TV_COLAB_EXCLUIDOS = ['CELSO', 'DENISE', 'ALESSANDRA', 'TRANSFERENCIA'];
export const tvColabExcluido = (colab: string): boolean => TV_COLAB_EXCLUIDOS.some(nome => normRamo(colab).startsWith(nome));
export const tvBaseRows = (todas: Linha[]): Linha[] => todas.filter(r => !tvColabExcluido(r.colab));

// ── Lado esquerdo: meta mensal de seguros novos ─────────────────────────────
// Mesmo classifyRamo da aba Metas (ramos elegíveis/excluídos, split pessoais x
// patrimoniais), mas só tipo de negócio N (sem endosso novo/renovações) — fixa
// no mês corrente comparado ao mesmo mês do ano anterior, com crescimento fixo
// de 40% (não usa o filtro de vigência nem o % configurável da aba Metas).
export const TV_NOVOS_GROWTH = 1.40;

export type AcumuladoNovos = { realPremio: number; realCom: number; basePremio: number; baseCom: number; metaPremio: number; metaCom: number };
export function buildTvMetaNovos(todas: Linha[], hoje: DataISO): { curStart: DataISO; data: Record<EquipeMeta, AcumuladoNovos> } {
  const y = anoISO(hoje), mIdx = mesISO(hoje) - 1; // 0-indexado
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const curStart = `${y}-${pad(mIdx + 1)}-01`, curEnd = `${y}-${pad(mIdx + 1)}-${pad(lastDay(y, mIdx))}`;
  const baseY = y - 1;
  const baseStart = `${baseY}-${pad(mIdx + 1)}-01`, baseEnd = `${baseY}-${pad(mIdx + 1)}-${pad(lastDay(baseY, mIdx))}`;

  const data = {} as Record<EquipeMeta, AcumuladoNovos>;
  META_TEAMS.forEach(t => { data[t] = { realPremio: 0, realCom: 0, basePremio: 0, baseCom: 0, metaPremio: 0, metaCom: 0 }; });

  tvBaseRows(todas).forEach(r => {
    if (r.tipo !== 'N') return; // só tipo de negócio N
    const team = classifyRamo(r.ramo); // exclui ramos fora da meta (classifyRamo === 'excluded')
    if (team === 'excluded') return;
    const ds = r.vig;
    if (!ds) return;
    const acc = ds >= curStart && ds <= curEnd ? 'real' : ds >= baseStart && ds <= baseEnd ? 'base' : null;
    if (!acc) return;
    [data[team], data.geral].forEach(d => { d[acc === 'real' ? 'realPremio' : 'basePremio'] += r.premio; d[acc === 'real' ? 'realCom' : 'baseCom'] += r.com; });
  });

  META_TEAMS.forEach(t => {
    data[t].metaPremio = data[t].basePremio * TV_NOVOS_GROWTH;
    data[t].metaCom = data[t].baseCom * TV_NOVOS_GROWTH;
  });

  return { curStart, data };
}

// ── Carteira ──────────────────────────────────────────────────────────────────
// Duração mínima (em dias) pra uma apólice contar como parte da carteira nos
// gráficos da Exibição TV (carteira acumulada e clientes por nível) — ~12
// meses, com folga de 15 dias pra não excluir uma anual normal (sempre fecha
// em 364/365 dias). Abaixo disso é seguro temporário/acessório (viagem, carta
// verde e similares). Não filtra pelo nome do ramo porque a duração já pega
// viagem/carta verde e qualquer outro produto de curta duração junto.
export const TV_CARTEIRA_MIN_DIAS = 350;
// O app antigo subtrai Dates (instantes): vigMs é o instante exato da 1ª vigência; o término é a meia-noite de SP da data.
const vigMs = (r: Pick<Linha, 'vig' | 'vigMs'>): number => r.vigMs ?? instanteDeDataISO(r.vig);
export const tvDuracaoOk = (r: Pick<Linha, 'vig' | 'vigMs' | 'fim'>): boolean => !r.fim || (instanteDeDataISO(r.fim) - vigMs(r)) / 86400000 >= TV_CARTEIRA_MIN_DIAS;

// A duração sozinha não basta: ela tem o furo do `!r.fim` — apólice sem término
// de vigência preenchido passa por qualquer ramo — e a viagem anual (multi-viagem)
// dura 365 dias. Como viagem e carta verde não são carteira recorrente, ficam de
// fora pelo nome do ramo também. Lista própria e curta de propósito: NÃO é o
// classifyRamo() === 'excluded' da aba Metas, que derrubaria junto acidentes
// pessoais, previdência e outros que aqui continuam contando como carteira.
export const TV_CARTEIRA_RAMOS_FORA = ['VIAGEM', 'CARTA VERDE'];
export const tvRamoCarteiraOk = (r: Pick<Linha, 'ramo'>): boolean => !TV_CARTEIRA_RAMOS_FORA.some(k => normRamo(r.ramo).includes(k));

// Carteira ativa de hoje, a mesma nos dois gráficos da TV: apólices (sem endosso)
// N/R com SITUAÇÃO 'Ativa', filtradas pelos critérios de carteira acima.
// Duas proteções contra arquivo de ano anterior desatualizado (ver
// contarAtivasVencidas): fora a 'Ativa' com término vencido além da folga, e o mesmo
// número de apólice na mesma seguradora conta uma vez só (fica o início mais recente).
export function tvCarteiraAtivaHoje(todas: Linha[], hoje: DataISO): Linha[] {
  const corte = addDiasISO(hoje, -ATIVA_VENCIDA_FOLGA_DIAS);
  const unicas = new Map<string | Linha, Linha>();
  todas.forEach(r => {
    if (r.sit !== SIT.ATIVA || !isApolice(r) || (r.tipo !== 'N' && r.tipo !== 'R') || !r.vig) return;
    if (!tvDuracaoOk(r) || !tvRamoCarteiraOk(r)) return;
    if (r.fim && r.fim < corte) return;
    const k = r.apolice ? r.seg + '|' + r.apolice : r;
    const atual = unicas.get(k);
    if (!atual || vigMs(r) > vigMs(atual)) unicas.set(k, r);
  });
  return [...unicas.values()];
}

// Carteira acumulada por ano: retrato por data, não pelo status de hoje, para
// os anos já fechados. Para cada ano Y anterior ao corrente, conta quantas
// apólices já tinham vigência iniciada e ainda não tinham terminado/sido
// canceladas até 31/12 daquele ano. Usa r.fim (término de vigência) e
// r.cancel (data de cancelamento) — não r.sit — porque o status atual só
// reflete o presente: uma apólice de anos atrás que já renovou várias vezes
// hoje aparece como "Renovada"/"Vencida", mas estava genuinamente em vigor
// naquele ano. Isso também evita contar a mesma apólice em vários anos (cada
// renovação é uma linha com sua própria janela vig→fim, sem sobreposição).
//
// O ano corrente é o retrato de HOJE: a carteira ativa inteira, não só o que
// foi emitido/renovado dentro do ano (tvCarteiraAtivaHoje). Conta as apólices com
// SITUAÇÃO 'Ativa', venham de que ano vierem — é o mesmo "quantas apólices estavam
// em vigor naquela data" dos anos fechados, com a data sendo hoje. Usar 'Ativa' (e
// não a janela vig→fim) evita contar duas vezes o contrato renovado com
// antecedência: a linha antiga vira 'Renovada' e só a sucessora fica 'Ativa'
// (METRICAS.md §1.1) — desde que o arquivo do ano da linha antiga esteja em dia.
export function buildTvAnoCarteira(todas: Linha[], hoje: DataISO): { labels: string[]; data: number[] } {
  const rows: { vig: number; ano: number; fim: number | null }[] = [];
  for (const r of todas) {
    if (!(isApolice(r) && (r.tipo === 'N' || r.tipo === 'R') && r.vig && tvDuracaoOk(r) && tvRamoCarteiraOk(r))) continue;
    const fim = (r.sit === 'Cancelada' && r.cancel) ? r.cancel : r.fim;
    // getFullYear() do antigo é o ano LOCAL do Date (vigLocal, quando difere de vig).
    rows.push({ vig: vigMs(r), ano: anoISO(r.vigLocal || r.vig), fim: fim ? instanteDeDataISO(fim) : null });
  }
  if (!rows.length) return { labels: [], data: [] };
  // Sem spread: a base multi-ano passa de 100 mil linhas e estoura a pilha.
  let minY = Infinity;
  for (const r of rows) { if (r.ano < minY) minY = r.ano; }
  const maxY = anoISO(hoje);
  const labels: string[] = [], data: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    let count: number;
    if (y === maxY) {
      count = tvCarteiraAtivaHoje(todas, hoje).length;
    } else {
      const checkpoint = instanteDeDataISO(`${y}-12-31`);
      count = 0;
      for (const r of rows) if (r.vig <= checkpoint && (r.fim === null || r.fim >= checkpoint)) count++;
    }
    labels.push(String(y));
    data.push(count);
  }
  return { labels, data };
}

// Variação percentual entre duas barras vizinhas, no mesmo formato da faixa de
// variação do gráfico mensal (ver renderEvolucao): sinal explícito e uma casa.
export const fVarPct = (pct: number): string => (pct >= 0 ? '+' : '−') + Math.abs(pct * 100).toFixed(1).replace('.', ',') + '%';

// Clientes por nível — mesma classificação/contagem da aba Cross-sell (CROSS_NIVEIS, contarNiveis),
// mas sem os filtros de colaborador/busca daquela aba: é sempre a carteira inteira. Todos os clientes
// (PF + PJ), de qualquer colaborador (não exclui Celso/Denise — só o ranking e os cards da esquerda excluem),
// já descontando os seguros temporários/acessórios (tvDuracaoOk) e viagem/carta verde (tvRamoCarteiraOk) —
// mesmo critério de carteira do gráfico de carteira acumulada, senão um cliente subiria de nível por causa de
// duas apólices de viagem enquanto o outro gráfico do mesmo painel as ignora.
export function buildTvNivelCounts(todas: Linha[], hoje: DataISO): number[] {
  const porDoc = new Map<string, { apolicesAtivas: number }>();
  tvCarteiraAtivaHoje(todas, hoje).forEach(r => {
    if (!r.docDigits) return;
    let c = porDoc.get(r.docDigits);
    if (!c) { c = { apolicesAtivas: 0 }; porDoc.set(r.docDigits, c); }
    c.apolicesAtivas++;
  });
  return contarNiveis([...porDoc.values()]);
}

// ── Santolin 360 (metas e pódio), sem Celso/Denise/… ─────────────────────────
// Nome curto (primeiro nome + inicial do sobrenome) só pra exibição na TV —
// não mexe em renderPodium/getCampanha360Ranking, usados também na aba Cross-sell.
export const tvNomeCurto = (nome: string): string => {
  const partes = nome.trim().split(/\s+/);
  return partes.length < 2 ? partes[0] : `${partes[0]} ${partes[1][0]}.`;
};

// ── Dados de tudo o que a tela mostra ────────────────────────────────────────
export type CartaoNovos = { team: EquipeMeta; label: string; cor: string; real: number; meta: number; gap: number; pct: number; pctTxt: string; pctCls: string; larguraPct: string };
export type LinhaNovos = { metrica: 'premio' | 'comissao'; rotulo: string; cartoes: CartaoNovos[] };
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type DadosTv = {
  novos: { badge: string; linhas: LinhaNovos[] };
  /** Barras de meta do painel escolhido; cada painel define quais existem (o 360_tri4 só tem `com`). */
  metasSantolin: { qtd?: MetaFases; com?: MetaFases };
  /** `colabs`: nome completo de cada colocado (null sem colocado) — chave da foto do colaborador. */
  podio: { badge: string; vazio: boolean; fotos: boolean; colunas: { titulo: string; nomes: [string, string, string]; colabs: [string | null, string | null, string | null] }[] };
  ano: { labels: string[]; data: number[]; badge: string };
  nivel: { labels: string[]; counts: number[]; total: number; badge: string };
};

export function exibicaoTv(todas: Linha[], hoje: DataISO, painel: PainelTv = painelTv('360_tri3')): DadosTv {
  // Meta mensal de novos
  const { curStart, data } = buildTvMetaNovos(todas, hoje);
  const [y, m] = curStart.split('-');
  const linhasNovos = (['premio', 'comissao'] as const).map((metrica): LinhaNovos => ({
    metrica, rotulo: metrica === 'premio' ? 'Prêmio' : 'Comissão',
    cartoes: META_TEAMS.map((t): CartaoNovos => {
      const d = data[t];
      const real = metrica === 'comissao' ? d.realCom : d.realPremio;
      const meta = metrica === 'comissao' ? d.metaCom : d.metaPremio;
      const pct = meta ? real / meta : 0, gap = real - meta;
      const pctClamp = Math.max(0, Math.min(1, pct));
      return { team: t, label: METAS_SEM_TEAM_LBL[t], cor: METAS_SEM_TEAM_COLOR[t], real, meta, gap, pct, pctTxt: fP(pct), pctCls: pctClsMeta(pct), larguraPct: (pctClamp * 100).toFixed(1) };
    }),
  }));

  // Santolin 360 (sem Celso/Denise/… como o resto do lado esquerdo)
  const rows = getCampanha360Rows(todas, painel.inicio, painel.fim).filter(r => !tvColabExcluido(r.colab));
  const qtd = rows.length;
  const comissao = rows.reduce((s, r) => s + r.com, 0);
  const metasSantolin: DadosTv['metasSantolin'] = {};
  for (const m of painel.metas) {
    if (m.tipo === 'qtd') metasSantolin.qtd = metaFases('Negócios Realizados', qtd, m.fases, fN);
    else metasSantolin.com = metaFases('Resultado Gerado', comissao, m.fases, fBRL);
  }
  const coluna = (tipo: 'qtd' | 'com') => {
    const t = getCampanha360Ranking(rows, tipo === 'qtd' ? 'qtd' : 'comissao');
    return {
      titulo: tipo === 'qtd' ? 'Top 3 — Negócios Realizados' : 'Top 3 — Resultado Gerado',
      nomes: [0, 1, 2].map(i => t[i] ? tvNomeCurto(t[i].colab) : '—') as [string, string, string],
      colabs: [0, 1, 2].map(i => t[i]?.colab ?? null) as [string | null, string | null, string | null],
    };
  };
  const podio = {
    badge: CAMPANHA_360_NOME, vazio: !rows.length, fotos: painel.fotos,
    colunas: rows.length ? painel.podios.map(coluna) : [],
  };

  const ano = buildTvAnoCarteira(todas, hoje);
  const totalAno = ano.data.length ? ano.data[ano.data.length - 1] : 0;
  const counts = buildTvNivelCounts(todas, hoje);
  const total = counts.reduce((s, v) => s + v, 0);
  return {
    novos: { badge: MESES[+m - 1] + '/' + y, linhas: linhasNovos },
    metasSantolin, podio,
    ano: { ...ano, badge: fN(totalAno) + ' apólices ativas' },
    nivel: { labels: CROSS_NIVEIS.map(n => n.label), counts, total, badge: fN(total) + ' clientes' },
  };
}
