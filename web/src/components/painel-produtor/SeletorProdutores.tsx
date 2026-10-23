"use client";
import { useState } from "react";
import s from "./SeletorProdutores.module.css";

export type Opcao = { id: string; rotulo: string; nomes: string[] };
export type Opcoes = { pessoas: Opcao[]; semDono: Opcao[] };

/** Forma curta de um nome da planilha: o que vem antes de " - " ("ALESSANDRA (OFICIAL) - SANTOLIN" → "ALESSANDRA (OFICIAL)"). */
export const nomeCurto = (nome: string): string => nome.split(" - ")[0].trim() || nome;

/**
 * Opções do seletor: pessoas (vínculos) e nomes sem dono (distintos da base que não estão
 * vinculados a ninguém nem ignorados). `id` = `p:{id do usuário}` (dois logins podem ter o mesmo
 * nome de exibição) / `n:{nome}`.
 */
export function opcoesSeletor(
  produtores: { id: number; nome: string; nomes: string[] }[],
  distintos: { nome: string; qtd: number }[],
  ignorados: string[],
): Opcoes {
  const vinculados = new Set(produtores.flatMap((p) => p.nomes));
  const ign = new Set(ignorados);
  return {
    pessoas: produtores.map((p) => ({ id: `p:${p.id}`, rotulo: p.nome, nomes: p.nomes })),
    semDono: distintos
      .filter((d) => !vinculados.has(d.nome) && !ign.has(d.nome))
      .map((d) => ({ id: `n:${d.nome}`, rotulo: nomeCurto(d.nome), nomes: [d.nome] })),
  };
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca + caixas de marcar em dois grupos; as marcadas aparecem como etiquetas removíveis. */
export function SeletorProdutores({ opcoes, selecionados, aoMudar }: {
  opcoes: Opcoes; selecionados: ReadonlySet<string>; aoMudar: (ids: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const todas = [...opcoes.pessoas, ...opcoes.semDono];
  const marcadas = todas.filter((o) => selecionados.has(o.id));
  const alternar = (id: string) => {
    const novo = new Set(selecionados);
    if (!novo.delete(id)) novo.add(id);
    aoMudar(novo);
  };
  const q = norm(busca.trim());
  const filtra = (l: Opcao[]) => l.filter((o) => !q || norm(o.rotulo).includes(q) || o.nomes.some((n) => norm(n).includes(q)));
  const grupo = (titulo: string, l: Opcao[]) => {
    const vis = filtra(l);
    if (!vis.length) return null;
    return (
      <div role="group" aria-label={titulo}>
        <div className={s.grupo}>{titulo}</div>
        {vis.map((o) => (
          <label key={o.id} className={s.opcao} title={o.nomes.join(" , ")}>
            <input type="checkbox" checked={selecionados.has(o.id)} onChange={() => alternar(o.id)} />
            {o.rotulo}
          </label>
        ))}
      </div>
    );
  };
  return (
    <div className={s.sel}>
      <span className={s.rotulo}>Produtores:</span>
      {marcadas.map((o) => (
        <span key={o.id} className={s.chip} title={o.nomes.join(" , ")}>
          {o.rotulo}
          <button type="button" aria-label={`Remover ${o.rotulo}`} onClick={() => alternar(o.id)}>×</button>
        </span>
      ))}
      <button type="button" className={s.add} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>+ adicionar</button>
      {aberto && (
        <div className={s.menu}>
          <input type="search" placeholder="Buscar produtor…" aria-label="Buscar produtor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {grupo("Pessoas", opcoes.pessoas)}
          {grupo("Nomes sem dono", opcoes.semDono)}
          {!filtra(todas).length && <p className={s.vazio}>Nenhum produtor encontrado.</p>}
        </div>
      )}
    </div>
  );
}
