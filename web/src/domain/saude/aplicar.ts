import type { DataISO, Linha } from '../tipos';
import { normRamo } from '../ramos';
import { SIT, isApolice } from '../situacoes';
import type { SaudeParse } from './parse';

export { SAUDE_FILE } from './parse';

// ── Saúdes lançados à parte (saude_fernando.xlsx) ──────────────────────────────
// O ERP não consegue lançar a remuneração do seguro saúde — agenciamento sobre o
// prêmio líquido das 3 primeiras parcelas + 2% ao ano sobre o saldo —, então a
// apólice chega na produção com prêmio e comissão ZERADOS. Os valores do contrato
// vêm de uma planilha à parte, uma linha por contrato, vinculada pela APÓLICE — ou,
// para os saúdes ainda sem número de apólice, pelo CPF/CNPJ (ou cliente) + vigência.
//
//   prêmio   = PRÊMIO LÍQUIDO, como está: já é o total do contrato (a planilha
//              calcula valor da PARCELA × QTD. PARCELAS, líquido de IOF)
//   comissão = TOTAL RECEBIDO (ou AGENCIAMENTO R$ + COMISSÃO R$, se vier vazio)
//
// Valor vazio, zero ou negativo na planilha não sobrescreve o da produção.
//
// As faturas mensais pagas entram na produção como endosso (EN/ER) com o prêmio e a
// comissão do mês. Somadas ao valor cheio, duplicariam o contrato — ver
// saudeFaturaConta(). Detalhes em METRICAS.md §8.
// Usado só quando a apólice não existe na produção e a linha não traz COLABORADOR.
export const SAUDE_COLAB_PADRAO = 'FERNANDO DE PAULA SERAFIM';

export const isSaude = (r: { ramo: string }): boolean => normRamo(r.ramo).includes('SAUDE');

// Uma fatura de saúde (endosso) só soma quando o tipo da linha com o valor cheio
// está FORA dos tipos considerados — ou seja, quando o filtro de tipo deixa passar
// só os endossos. Sem filtro de tipo, ou com N/R marcado, vale o valor cheio.
//   tipos: o Set de tipos marcados (vazio = todos).
export function saudeFaturaConta(r: { saudeFaturaDe?: string }, tipos: ReadonlySet<string>): boolean {
  if (!r.saudeFaturaDe) return true;
  return tipos.size > 0 && !tipos.has(r.saudeFaturaDe);
}
// Para quem lê a base sem filtro de tipo (gráfico por períodos, LTV do cross-sell).
export const SEM_FILTRO_TIPO: ReadonlySet<string> = new Set<string>();

const diasEntre = (a: DataISO, b: DataISO): number =>
  Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;
const maisUmAno = (d: DataISO): DataISO => {
  const [a, m, dia] = d.split('-').map(Number);
  return new Date(Date.UTC(a + 1, m - 1, dia)).toISOString().slice(0, 10);
};

// Mescla a planilha de saúde nas linhas (equivale a applySaudeManual). Troca elementos
// por cópias dentro do array e acrescenta os saúdes que a produção não tem. `hoje` só
// decide a situação dos saúdes criados sem SITUAÇÃO.
export function aplicarSaude(linhas: Linha[], saude: SaudeParse, hoje: DataISO):
  { vinculadas: number; criadas: number; avisos: string[] } {
  const rows = saude.linhas;
  const avisos = [...saude.avisos]; // recarga não pode acumular avisos repetidos
  const add = (map: Map<string, number[]>, k: string, idx: number) => {
    if (!k) return;
    const l = map.get(k);
    if (l) l.push(idx); else map.set(k, [idx]);
  };
  const porApolice = new Map<string, number[]>(), porDoc = new Map<string, number[]>(), porCli = new Map<string, number[]>();
  linhas.forEach((r, idx) => {
    if (!isSaude(r)) return;
    add(porApolice, r.apolice, idx);
    if (r.tipo !== 'N' && r.tipo !== 'R') return;
    add(porDoc, r.docDigits, idx);
    add(porCli, normRamo(r.cli), idx);
  });
  const colabFernando = linhas.find(r => isSaude(r) && normRamo(r.colab).startsWith('FERNANDO'))?.colab
    || SAUDE_COLAB_PADRAO;

  let vinculadas = 0, criadas = 0;
  const usados = new Set<number>();
  rows.forEach(s => {
    const rotulo = s.apolice ? `apólice ${s.apolice}` : s.cli;
    // Linha cheia: a apólice em si (N/R). Com renovações de mesmo número, a planilha
    // desempata pelo tipo e pelo início de vigência, quando informados.
    let cands = (porApolice.get(s.apolice) || []).filter(i => !usados.has(i) && (linhas[i].tipo === 'N' || linhas[i].tipo === 'R'));
    if (s.tipo) cands = cands.filter(i => linhas[i].tipo === s.tipo).concat(cands.filter(i => linhas[i].tipo !== s.tipo));
    if (s.vig) {
      const ano = s.vig.slice(0, 4);
      const rank = (i: number) => linhas[i].vig === s.vig ? 0 : linhas[i].vig.slice(0, 4) === ano ? 1 : 2;
      cands.sort((a, b) => rank(a) - rank(b));
    }
    cands.sort((a, b) => (isApolice(linhas[b]) ? 1 : 0) - (isApolice(linhas[a]) ? 1 : 0));
    // Sem apólice (ou apólice ainda não cadastrada no ERP): o saúde costuma existir na
    // produção como linha N sem número. Casa pelo CPF/CNPJ — ou pelo nome do cliente —
    // com início de vigência a até 31 dias do informado. Sem vigência na planilha, só
    // vincula se houver um único candidato, para não chutar entre contratos do cliente.
    if (!cands.length) {
      const base = (s.docDigits ? porDoc.get(s.docDigits) : porCli.get(normRamo(s.cli))) || [];
      const livres = base.filter(i => !usados.has(i) && (!s.apolice || !linhas[i].apolice));
      if (s.vig) {
        const dist = (i: number) => linhas[i].vig ? diasEntre(linhas[i].vig, s.vig) : Infinity;
        cands = livres.filter(i => dist(i) <= 31).sort((a, b) => dist(a) - dist(b));
      } else if (livres.length === 1) cands = livres;
    }
    let cheia: Linha;
    if (cands.length) {
      const i = cands[0], orig = linhas[i];
      usados.add(i);
      cheia = linhas[i] = { ...orig, saudeManual: true, colab: s.colab || orig.colab,
        premio: s.premio > 0 ? s.premio : orig.premio, com: s.com > 0 ? s.com : orig.com };
      vinculadas++;
    } else {
      const vig = s.vig || s.em;
      if (!vig) { avisos.push(`linha ${s.linha}: ${rotulo} não está na produção e não tem INÍCIO DE VIGÊNCIA — ignorada`); return; }
      const fim = s.fim || maisUmAno(vig);
      const docDigits = s.docDigits;
      cheia = {
        tipo: s.tipo === 'R' ? 'R' : 'N', vig, em: s.em || vig, fim, cli: s.cli, seg: s.seg,
        ramo: 'Saúde', grp: s.grp, premio: s.premio, com: s.com, colab: s.colab || colabFernando,
        sit: s.sit || (fim > hoje ? SIT.ATIVA : SIT.VENCIDA), motivo: '', cancel: '', docDigits,
        tipoPessoa: docDigits.length === 11 ? 'PF' : docDigits.length > 11 ? 'PJ' : '',
        tipoDoc: 'APÓLICE', campanha: '', apolice: s.apolice, endosso: '', trocaSeg: false, saudeManual: true,
      };
      linhas.push(cheia);
      criadas++;
    }
    // Faturas da mesma apólice dentro da vigência do contrato.
    const ini = cheia.vig, fim = cheia.fim || '';
    (porApolice.get(cheia.apolice) || []).forEach(i => {
      const r = linhas[i];
      if (r.tipo !== 'EN' && r.tipo !== 'ER') return;
      const d = r.vig;
      if (ini && d && d < ini) return;
      if (fim && d && d >= fim) return;
      linhas[i] = { ...r, saudeFaturaDe: cheia.tipo };
    });
  });
  return { vinculadas, criadas, avisos };
}
