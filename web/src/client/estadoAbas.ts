"use client";
import { createContext, createElement, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

// Estado de interface das abas (rádios de métrica, ordenação, períodos, seleção de motivos…).
// No app antigo esse estado vivia no DOM e em globais do main.js e sobrevivia à troca de aba;
// no app novo cada aba é uma rota e seu componente desmonta ao sair. A store mora na casca
// (acima das rotas), em memória: não vai para o localStorage, como no antigo (recarregar a
// página volta ao estado inicial).
type Armazem = {
  valores: Map<string, unknown>;
  ouvintes: Set<() => void>;
};

const Contexto = createContext<Armazem | null>(null);

export function EstadoAbasProvider({ children }: { children: ReactNode }) {
  const [armazem] = useState<Armazem>(() => ({ valores: new Map(), ouvintes: new Set() }));
  return createElement(Contexto.Provider, { value: armazem }, children);
}

/** Como useState, mas o valor (por `chave`) sobrevive ao desmonte do componente. `inicial` só vale na primeira leitura. */
export function useEstadoAba<T>(chave: string, inicial: T): [T, (v: T | ((a: T) => T)) => void] {
  const arm = useContext(Contexto);
  if (!arm) throw new Error("useEstadoAba fora do EstadoAbasProvider");
  const [ini] = useState(inicial); // só o valor da primeira renderização (referência estável para o snapshot)
  const assinar = useCallback((fn: () => void) => { arm.ouvintes.add(fn); return () => { arm.ouvintes.delete(fn); }; }, [arm]);
  const ler = useCallback((): T => (arm.valores.has(chave) ? (arm.valores.get(chave) as T) : ini), [arm, chave, ini]);
  const valor = useSyncExternalStore(assinar, ler, ler);
  const definir = useCallback((v: T | ((a: T) => T)) => {
    const atual = arm.valores.has(chave) ? (arm.valores.get(chave) as T) : ini;
    const novo = typeof v === "function" ? (v as (a: T) => T)(atual) : v;
    if (Object.is(novo, atual)) return;
    arm.valores.set(chave, novo);
    arm.ouvintes.forEach((fn) => fn());
  }, [arm, chave, ini]);
  return [valor, definir];
}
