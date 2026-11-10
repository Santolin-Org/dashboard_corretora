"use client";
import { useState } from "react";
import type { Linha } from "@/domain/tipos";
import type { ChaveAtribuicao, NovaAtribuicao } from "@/client/atribuicoes";
import s from "./Renovacoes.module.css";

// Ação da linha (só gestão/admin): escolher o novo responsável da vigência que chega para renovar, ou voltar ao
// colaborador da planilha. Grava em /api/atribuicoes; a lista se atualiza pela base marcada.
export function AtribuirResponsavel({ antiga, colaboradores, salvar, desfazer }: {
  antiga: Linha; colaboradores: string[];
  salvar(a: NovaAtribuicao): Promise<void>; desfazer(k: ChaveAtribuicao): Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [para, setPara] = useState(antiga.resp ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const chave = { seg: antiga.seg, apolice: antiga.apolice, fim: antiga.fim };
  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true); setErro("");
    try { await fn(); setAberto(false); } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setOcupado(false); }
  };
  if (!aberto) return <button type="button" className="btn-sm" style={{ fontSize: 10 }} onClick={() => setAberto(true)}>Atribuir</button>;
  return (
    <div className={s.atribuir}>
      <select aria-label="Novo responsável" value={para} onChange={(e) => setPara(e.target.value)} disabled={ocupado}>
        <option value="">Escolha…</option>
        {colaboradores.filter((c) => c !== antiga.colab).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className="btn-sm" disabled={ocupado || !para || para === antiga.resp}
        onClick={() => executar(() => salvar({ ...chave, para, de: antiga.colab }))}>Salvar</button>
      {antiga.resp !== undefined && (
        <button type="button" className="btn-sm" disabled={ocupado} onClick={() => executar(() => desfazer(chave))}>Voltar ao original</button>
      )}
      <button type="button" className="btn-sm" disabled={ocupado} onClick={() => setAberto(false)}>Cancelar</button>
      {erro && <span role="alert" className={s.erroAtribuir}>{erro}</span>}
    </div>
  );
}
