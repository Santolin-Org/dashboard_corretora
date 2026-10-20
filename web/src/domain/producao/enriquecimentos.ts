import type { DataISO, Linha } from '../tipos';
import { addDiasISO } from '../datas';
import { normRamo } from '../ramos';
import { SIT, normSit, isApolice, chaveApolice } from '../situacoes';

// Data em que a apólice saiu (ou sai) da carteira. Cancelada sem data de
// cancelamento cai no término de vigência.
export function churnSaida(r: Pick<Linha, 'sit' | 'cancel' | 'fim'>): DataISO {
  return r.sit === SIT.CANCELADA && r.cancel ? r.cancel : r.fim;
}

// ── Motivo de cancelamento vindo do endosso ───────────────────────────────────
// O Quiver costuma registrar o motivo no endosso de cancelamento (CN/CR), e não na
// linha da apólice. Regra de negócio: o motivo do endosso vale primeiro, o da própria
// apólice só quando nenhum endosso traz motivo. Com mais de um endosso com motivo,
// fica o mais recente (data de cancelamento, ou início do endosso).
// O vínculo é seguradora + número da apólice — o endosso repete o número da mãe.
// Normaliza a situação aqui também, como o app antigo (linhas podem ter sido parseadas
// antes desta regra existir). O resultado é o mesmo a cada recarga (o endosso não muda),
// então alterar a linha no lugar é seguro.
export function applyMotivoEndosso(linhas: Linha[]): void {
  const doEndosso = new Map<string, { motivo: string; d: DataISO }>();
  linhas.forEach(r => {
    r.sit = normSit(r.sit);
    if ((r.tipo !== 'CN' && r.tipo !== 'CR') || !r.apolice || !r.motivo.trim()) return;
    const k = chaveApolice(r), d = r.cancel || r.vig, atual = doEndosso.get(k);
    if (!atual || d > atual.d) doEndosso.set(k, { motivo: r.motivo.trim(), d });
  });
  linhas.forEach(r => {
    if (!isApolice(r)) return;
    const e = doEndosso.get(chaveApolice(r));
    if (e) r.motivo = e.motivo;
  });
}

// ── Cancelamento que foi troca de seguradora ─────────────────────────────────
// É prática da corretora cancelar a apólice e reemitir o cliente em outra cia — muitas
// vezes como R, para aproveitar o bônus de renovação. O motivo quase nunca registra
// isso, então a regra olha o SALDO de apólices do cliente naquele ramo:
//   antes  = a apólice cancelada + as outras do cliente (CPF/CNPJ + ramo) em vigor
//            15 dias antes do cancelamento (a nova costuma nascer uns dias antes de o
//            cancelamento ser lançado) — ou no início da cancelada, se for mais tarde
//   depois = as do cliente em vigor 90 dias depois do cancelamento (ou hoje, se os
//            90 dias ainda não passaram — até lá a troca pode não ter acontecido)
// depois >= antes → o cliente não diminuiu: foi troca (ou bônus aproveitado em mais
// de um item), não churn. Marca r.trocaSeg na apólice e nos endossos CN/CR dela.
export const TROCA_DIAS_ANTES = 15, TROCA_DIAS_DEPOIS = 90;
export function applyTrocaSeguradora(linhas: Linha[], hoje: DataISO): void {
  const porCliente = new Map<string, Linha[]>();
  linhas.forEach(r => {
    r.trocaSeg = false;
    if (!isApolice(r) || (r.tipo !== 'N' && r.tipo !== 'R') || !r.docDigits || !r.vig) return;
    const k = r.docDigits + '|' + normRamo(r.ramo);
    let l = porCliente.get(k);
    if (!l) { l = []; porCliente.set(k, l); }
    l.push(r);
  });
  const emVigor = (lista: Linha[], t: DataISO, exceto?: Linha) =>
    lista.filter(x => x !== exceto && x.vig <= t && churnSaida(x) > t).length;
  const trocas = new Set<string>();
  porCliente.forEach(lista => lista.forEach(r => {
    if (r.sit !== SIT.CANCELADA) return;
    const saida = churnSaida(r);
    if (!saida) return;
    const antes = addDiasISO(saida, -TROCA_DIAS_ANTES), depois = addDiasISO(saida, TROCA_DIAS_DEPOIS);
    const t0 = antes > r.vig ? antes : r.vig;
    const t1 = depois < hoje ? depois : hoje;
    if (emVigor(lista, t1) >= 1 + emVigor(lista, t0, r)) { r.trocaSeg = true; trocas.add(chaveApolice(r)); }
  }));
  linhas.forEach(r => { if ((r.tipo === 'CN' || r.tipo === 'CR') && trocas.has(chaveApolice(r))) r.trocaSeg = true; });
}
