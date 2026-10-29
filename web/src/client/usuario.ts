"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Papel } from "@/server/db/schema";

export type Usuario = { email: string; nome: string; role: Papel; nomes: string[] };

const PAPEIS: readonly string[] = ["admin", "gestao", "vendedor"];

// Estado no módulo, compartilhado por quem chamar o hook: uma busca por carga da página, repetida
// quando a base muda (sinal) ou em recarregarUsuario(). Falha (401/503/rede) ou corpo inválido
// viram usuario null com falhou = true — a casca segue sem o pé da barra e sem o grupo Admin.
// Uma nova busca que falha mantém o último usuário bom (o vínculo não some por um soluço do servidor).
type Estado = { usuario: Usuario | null; falhou: boolean };
let busca: Promise<void> | null = null;
let resolvido: Estado | null = null;
const ouvintes = new Set<() => void>();

function valido(c: unknown): c is Usuario {
  const u = c as Partial<Usuario> | null;
  return !!u && typeof u.email === "string" && typeof u.nome === "string" && PAPEIS.includes(u.role as string)
    && Array.isArray(u.nomes);
}

/** `forcar`: começa outra busca mesmo com uma no ar (a resposta da antiga é descartada). */
function buscarUsuario(forcar = false): Promise<void> {
  if (busca && !forcar) return busca;
  const minha: Promise<void> = Promise.resolve()
    .then(() => fetch("/api/eu", { credentials: "same-origin" }))
    .then((r) => (r.ok ? r.json() : null))
    .then((c: unknown): Estado => (valido(c)
      ? { usuario: { email: c.email, nome: c.nome, role: c.role, nomes: c.nomes }, falhou: false }
      : { usuario: null, falhou: true }))
    .catch((): Estado => ({ usuario: null, falhou: true }))
    .then((novo) => {
      if (busca !== minha) return; // esquecida (testes) enquanto voava
      busca = null;
      if (!(novo.falhou && resolvido?.usuario)) resolvido = novo;
      ouvintes.forEach((fn) => fn());
    });
  busca = minha;
  return minha;
}

/** Busca /api/eu de novo (sem voltar a "carregando": o usuário atual fica na tela até a resposta). */
export function recarregarUsuario(): void { void buscarUsuario(true); }

/** Só para testes: esquece a busca feita, para a próxima chamada buscar de novo. */
export function esquecerUsuario(): void { busca = null; resolvido = null; }

const assinar = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
const ler = () => resolvido;
const lerServidor = () => null;

/**
 * Quem está logado (GET /api/eu). No bypass de paridade, o admin sintético que a rota devolve.
 * `sinal` (a Casca passa a base): quando muda de um valor para outro, busca de novo — um vínculo
 * novo muda o escopo e a base; sem isso o Meu painel seguiria com os nomes antigos até recarregar.
 */
export function useUsuario(sinal?: unknown): {
  usuario: Usuario | null; carregando: boolean; falhou: boolean; recarregar(): void;
} {
  const estado = useSyncExternalStore(assinar, ler, lerServidor);
  useEffect(() => { if (!resolvido) void buscarUsuario(); }, []);
  const anterior = useRef(sinal);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = sinal;
    if (antes !== undefined && sinal !== undefined && antes !== sinal) recarregarUsuario();
  }, [sinal]);
  return { usuario: estado?.usuario ?? null, carregando: !estado, falhou: estado?.falhou ?? false, recarregar: recarregarUsuario };
}
