"use client";
import type { Usuario } from "./usuario";

/**
 * Última base recebida de /api/dados, guardada no navegador (IndexedDB) para o painel abrir na hora
 * na próxima visita, enquanto a base nova chega. Fica no formato colunar da resposta.
 * Segurança: a cópia só é mostrada para o mesmo usuário com o mesmo papel e vínculos (`dono`);
 * "Sair" apaga a cópia.
 */
export type Salva<C> = { dono: string; salvoEm: number; corpo: C };

export interface MemoriaBase {
  /** Há onde guardar? Sem isso nem se busca o usuário para gravar. */
  disponivel(): boolean;
  ler<C>(): Promise<Salva<C> | null>;
  gravar<C>(s: Salva<C>): Promise<void>;
  apagar(): Promise<void>;
}

/** Dono da cópia: muda quando muda quem vê, o papel ou os vínculos (o recorte dos dados). */
export function chaveDono(u: Pick<Usuario, "email" | "role" | "nomes">): string {
  return JSON.stringify([u.email.toLowerCase(), u.role, [...u.nomes].sort()]);
}

const BANCO = "dashboard", LOJA = "base", CHAVE = "ultima";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (l: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, falha) => {
      const tx = db.transaction(LOJA, modo);
      const r = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => ok(r.result as T);
      tx.onerror = () => falha(tx.error);
      tx.onabort = () => falha(tx.error);
    });
  } finally {
    db.close();
  }
}

/** IndexedDB; sem ele (navegador privado, testes) não guarda nada e nunca lança. */
export const memoriaIndexedDb: MemoriaBase = {
  disponivel: () => typeof indexedDB !== "undefined",
  async ler<C>() {
    try {
      if (typeof indexedDB === "undefined") return null;
      return (await operar<Salva<C> | undefined>("readonly", (l) => l.get(CHAVE))) ?? null;
    } catch {
      return null;
    }
  },
  async gravar(s) {
    try {
      if (typeof indexedDB !== "undefined") await operar("readwrite", (l) => l.put(s, CHAVE));
    } catch { /* sem espaço ou bloqueado: só não abre rápido na próxima vez */ }
  },
  async apagar() {
    try {
      if (typeof indexedDB !== "undefined") await operar("readwrite", (l) => l.delete(CHAVE));
    } catch { /* idem */ }
  },
};

let memoria: MemoriaBase = memoriaIndexedDb;
export function memoriaBase(): MemoriaBase { return memoria; }
/** Testes: troca o armazenamento (null volta ao IndexedDB). */
export function definirMemoriaBase(m: MemoriaBase | null): void { memoria = m ?? memoriaIndexedDb; }
