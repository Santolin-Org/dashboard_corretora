"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Base } from "@/server/ingestao";
import type { Linha } from "@/domain/tipos";
import type { Sinistro } from "@/domain/sinistros/parse";
import {
  decodificarLinhas, decodificarSinistros, type LinhasColunares, type SinistrosColunares,
} from "@/domain/serializacao";

export type BaseCliente = Omit<Base, "linhas" | "sinistros"> & { linhas: Linha[]; sinistros: Sinistro[] };
export type EstadoBase = "carregando" | "pronto" | "erro" | "sessao-expirada";

type Corpo = Omit<Base, "linhas" | "sinistros"> & { linhas: LinhasColunares; sinistros: SinistrosColunares };

export function useBase(): { estado: EstadoBase; base?: BaseCliente; erro?: string; recarregar(): void } {
  const [estado, setEstado] = useState<EstadoBase>("carregando");
  const [base, setBase] = useState<BaseCliente | undefined>();
  const [erro, setErro] = useState<string | undefined>();
  const etag = useRef<string | null>(null);
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++seq.current;
    try {
      const headers: Record<string, string> = {};
      if (etag.current) headers["If-None-Match"] = etag.current;
      const r = await fetch("/api/dados", { headers, credentials: "same-origin" });
      if (meu !== seq.current) return; // resposta de uma chamada antiga
      if (r.status === 401) { setEstado("sessao-expirada"); return; }
      if (r.status === 304) { setErro(undefined); setEstado("pronto"); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const c = (await r.json()) as Corpo;
      if (meu !== seq.current) return;
      setBase({ ...c, linhas: decodificarLinhas(c.linhas), sinistros: decodificarSinistros(c.sinistros) });
      etag.current = r.headers.get("etag");
      setErro(undefined);
      setEstado("pronto");
    } catch (e) {
      if (meu !== seq.current) return;
      setErro(e instanceof Error ? e.message : String(e));
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    // Busca inicial: os setState acontecem só depois do await (assíncronos), não no corpo do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    const contador = seq;
    return () => { contador.current = Number.MAX_SAFE_INTEGER; }; // invalida respostas pendentes após desmontar
  }, [carregar]);

  return { estado, base, erro, recarregar: () => void carregar() };
}
