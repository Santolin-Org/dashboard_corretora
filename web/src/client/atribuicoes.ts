"use client";
import { useCallback, useEffect, useState } from "react";
import { aplicarAtribuicoes, chaveAtribuicao, type Atribuicao, type Divergencia } from "@/domain/atribuicoes";
import type { BaseCliente } from "./useBase";

export type ChaveAtribuicao = { seg: string; apolice: string; fim: string };
export type NovaAtribuicao = ChaveAtribuicao & { para: string; de: string };
export type EstadoAtribuicoes = {
  atribuicoes: Atribuicao[];
  /** GET falhou (banco fora, rede): a lista fica vazia e as telas avisam. */
  erro: boolean;
  salvar(a: NovaAtribuicao): Promise<void>;
  desfazer(k: ChaveAtribuicao): Promise<void>;
};

async function enviar(method: "PUT" | "DELETE", corpo: unknown): Promise<void> {
  const r = await fetch("/api/atribuicoes", {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    const c = (await r.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(c?.erro ?? "Não foi possível salvar a atribuição.");
  }
}

/** Atribuições de renovação (spec 2026-11-10): busca uma vez quando `ativo`; salvar/desfazer gravam no servidor e
 *  atualizam a lista local, sem recarregar /api/dados. */
export function useAtribuicoes(ativo: boolean): EstadoAtribuicoes {
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    Promise.resolve()
      .then(() => fetch("/api/atribuicoes", { credentials: "same-origin" }))
      .then((r) => (r.ok ? (r.json() as Promise<{ atribuicoes?: Atribuicao[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        if (!vivo) return;
        const novas = Array.isArray(c.atribuicoes) ? c.atribuicoes : [];
        // Lista vazia de novo: mantém a mesma referência (não redesenha o painel à toa).
        setAtribuicoes((l) => (l.length === 0 && novas.length === 0 ? l : novas));
        setErro(false);
      })
      .catch(() => { if (vivo) { setAtribuicoes((l) => (l.length ? [] : l)); setErro(true); } });
    return () => { vivo = false; };
  }, [ativo]);

  const salvar = useCallback(async (a: NovaAtribuicao) => {
    await enviar("PUT", a);
    const nova: Atribuicao = { ...a, por: "", em: new Date().toISOString() };
    setAtribuicoes((l) => [...l.filter((x) => chaveAtribuicao(x) !== chaveAtribuicao(a)), nova]);
  }, []);

  const desfazer = useCallback(async (k: ChaveAtribuicao) => {
    await enviar("DELETE", k);
    setAtribuicoes((l) => l.filter((x) => chaveAtribuicao(x) !== chaveAtribuicao(k)));
  }, []);

  return { atribuicoes, erro, salvar, desfazer };
}

/** A base com as linhas marcadas pelas atribuições (sem atribuições: a mesma base, mesma identidade). */
export function comAtribuicoes(base: BaseCliente, atribs: Atribuicao[]): { base: BaseCliente; divergencias: Divergencia[] } {
  const r = aplicarAtribuicoes(base.linhas, atribs);
  return { base: r.linhas === base.linhas ? base : { ...base, linhas: r.linhas }, divergencias: r.divergencias };
}
