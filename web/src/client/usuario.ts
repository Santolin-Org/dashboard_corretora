"use client";
import { useEffect, useState } from "react";
import type { Papel } from "@/server/db/schema";

export type Usuario = { email: string; nome: string; role: Papel; nomes: string[] };

const PAPEIS: readonly string[] = ["admin", "gestao", "vendedor"];

// Uma busca por carga da página: a promessa fica no módulo e é compartilhada por quem chamar o hook.
// Falha (401/503/rede) ou corpo inválido viram null — a casca segue sem o pé da barra e sem o grupo Admin.
let busca: Promise<Usuario | null> | null = null;
let resolvido: { usuario: Usuario | null } | null = null;

function valido(c: unknown): c is Usuario {
  const u = c as Partial<Usuario> | null;
  return !!u && typeof u.email === "string" && typeof u.nome === "string" && PAPEIS.includes(u.role as string)
    && Array.isArray(u.nomes);
}

function buscarUsuario(): Promise<Usuario | null> {
  busca ??= Promise.resolve()
    .then(() => fetch("/api/eu", { credentials: "same-origin" }))
    .then((r) => (r.ok ? r.json() : null))
    .then((c: unknown) => (valido(c) ? { email: c.email, nome: c.nome, role: c.role, nomes: c.nomes } : null))
    .catch(() => null)
    .then((usuario) => { resolvido = { usuario }; return usuario; });
  return busca;
}

/** Só para testes: esquece a busca feita, para a próxima chamada buscar de novo. */
export function esquecerUsuario(): void { busca = null; resolvido = null; }

/** Quem está logado (GET /api/eu). No bypass de paridade, o admin sintético que a rota devolve. */
export function useUsuario(): { usuario: Usuario | null; carregando: boolean } {
  const [estado, setEstado] = useState(() => resolvido);
  useEffect(() => {
    if (estado) return;
    let vivo = true;
    void buscarUsuario().then((usuario) => { if (vivo) setEstado({ usuario }); });
    return () => { vivo = false; };
  }, [estado]);
  return { usuario: estado?.usuario ?? null, carregando: !estado };
}
