"use client";
import { useState } from "react";
import type { NovaAtribuicao } from "@/client/atribuicoes";
import { fN } from "@/domain/formatos";
import type { Linha } from "@/domain/tipos";
import s from "./Renovacoes.module.css";

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Texto do resultado: quantas foram atribuídas e quantas ficaram de fora por já serem do escolhido na planilha. */
export function mensagemLote(gravadas: number, ignoradas: number, para: string): string {
  const partes: string[] = [];
  if (gravadas) partes.push(`${fN(gravadas)} ${plural(gravadas, "renovação atribuída", "renovações atribuídas")} a ${para}.`);
  if (ignoradas) partes.push(`${fN(ignoradas)} ${plural(ignoradas, "já era", "já eram")} de ${para} na planilha e ${plural(ignoradas, "ficou como estava", "ficaram como estavam")}.`);
  return partes.join(" ");
}

// Barra da seleção (só gestão/admin): escolhe um responsável e grava todas as selecionadas num PUT só. A que já é do
// escolhido na planilha fica de fora (atribuir a alguém a própria apólice não muda nada).
export function AtribuirEmLote({ antigas, totalLista, colaboradores, salvarLote, selecionarTodas, limpar, concluir }: {
  antigas: Linha[]; totalLista: number; colaboradores: string[];
  salvarLote(itens: NovaAtribuicao[]): Promise<void>;
  selecionarTodas(): void; limpar(): void; concluir(mensagem: string): void;
}) {
  const [para, setPara] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const n = antigas.length;
  const atribuir = async () => {
    const itens = antigas.filter((a) => a.colab !== para).map((a) => ({ seg: a.seg, apolice: a.apolice, fim: a.fim, para, de: a.colab }));
    setOcupado(true); setErro("");
    try {
      if (itens.length) await salvarLote(itens);
      concluir(mensagemLote(itens.length, n - itens.length, para));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className={s.lote} role="region" aria-label="Atribuição em lote">
      <strong>{fN(n)} {plural(n, "selecionada", "selecionadas")}</strong>
      {n < totalLista && (
        <button type="button" className="btn-sm" disabled={ocupado} onClick={selecionarTodas}>Selecionar todas as {fN(totalLista)} da lista</button>
      )}
      <select aria-label="Responsável das selecionadas" value={para} onChange={(e) => setPara(e.target.value)} disabled={ocupado}>
        <option value="">Atribuir a…</option>
        {colaboradores.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className="btn-sm" disabled={ocupado || !para} onClick={atribuir}>Atribuir {fN(n)}</button>
      <button type="button" className="btn-sm" disabled={ocupado} onClick={limpar}>Limpar seleção</button>
      {erro && <span role="alert" className={s.erroAtribuir}>{erro}</span>}
    </div>
  );
}
