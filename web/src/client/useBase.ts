"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Base } from "@/server/ingestao";
import type { Linha } from "@/domain/tipos";
import type { Sinistro } from "@/domain/sinistros/parse";
import {
  decodificarLinhas, decodificarSinistros, type LinhasColunares, type SinistrosColunares,
} from "@/domain/serializacao";
import { chaveDono, memoriaBase } from "./memoriaBase";
import { obterUsuario } from "./usuario";

export type BaseCliente = Omit<Base, "linhas" | "sinistros"> & {
  linhas: Linha[]; sinistros: Sinistro[];
  /** Escopo "nada": o servidor não mandou dados (tela "acesso será liberado"). */
  semAcesso?: true;
};
/** Revalida /api/dados a cada 5 min: a TV fica ligada o dia todo e a chamada também renova o token (proxy). */
export const INTERVALO_REVALIDACAO_MS = 5 * 60 * 1000;
/** Falhas contínuas por mais que isto viram o aviso "Sem conexão com o servidor". */
export const LIMITE_SEM_CONEXAO_MS = 15 * 60 * 1000;

export type EstadoBase = "carregando" | "pronto" | "erro" | "sessao-expirada";

type Corpo = Omit<Base, "linhas" | "sinistros"> & { linhas: LinhasColunares; sinistros: SinistrosColunares };

/** Salva a resposta para a próxima abertura (só com dados e com o usuário conhecido). */
async function guardar(c: Corpo & { semAcesso?: true }): Promise<void> {
  if (c.semAcesso || !memoriaBase().disponivel()) return;
  const u = await obterUsuario();
  if (u) await memoriaBase().gravar({ dono: chaveDono(u), salvoEm: Date.now(), corpo: c });
}

export function useBase(): {
  estado: EstadoBase; base?: BaseCliente; erro?: string; recarregar(): void;
  /** epoch ms da última carga/revalidação bem-sucedida (200 ou 304). */
  ultimaBoaEm?: number;
  /** epoch ms do início das falhas, só quando duram mais de LIMITE_SEM_CONEXAO_MS. */
  semConexaoDesde?: number;
  /** epoch ms em que a cópia na tela foi salva, enquanto ela é a do navegador (a base nova ainda não chegou). */
  daMemoriaDe?: number;
} {
  const [estado, setEstado] = useState<EstadoBase>("carregando");
  const [base, setBase] = useState<BaseCliente | undefined>();
  const [erro, setErro] = useState<string | undefined>();
  const [ultimaBoaEm, setUltimaBoaEm] = useState<number | undefined>();
  const [semConexaoDesde, setSemConexaoDesde] = useState<number | undefined>();
  const [daMemoriaDe, setDaMemoriaDe] = useState<number | undefined>();
  const respondeu = useRef(false); // o servidor já respondeu (a cópia salva não entra mais)
  const falhaDesde = useRef<number | null>(null);
  const etag = useRef<string | null>(null);
  const seq = useRef(0);
  const vivo = useRef(true);

  const carregar = useCallback(async () => {
    const boa = () => {
      respondeu.current = true;
      setDaMemoriaDe(undefined);
      falhaDesde.current = null;
      setSemConexaoDesde(undefined);
      setUltimaBoaEm(Date.now());
      setErro(undefined);
      setEstado("pronto");
    };
    const meu = ++seq.current;
    try {
      const headers: Record<string, string> = {};
      if (etag.current) headers["If-None-Match"] = etag.current;
      const r = await fetch("/api/dados", { headers, credentials: "same-origin" });
      if (!vivo.current || meu !== seq.current) return; // resposta de uma chamada antiga
      // O proxy responde 401 também quando o refresh do token falhou (session.error = RefreshFailed),
      // então uma única chamada cobre os dois casos e já renova o cookie de sessão quando dá.
      if (r.status === 401) { respondeu.current = true; setEstado("sessao-expirada"); return; }
      if (r.status === 304) { boa(); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const c = (await r.json()) as Corpo;
      if (!vivo.current || meu !== seq.current) return;
      setBase({ ...c, linhas: decodificarLinhas(c.linhas), sinistros: decodificarSinistros(c.sinistros) });
      etag.current = r.headers.get("etag");
      boa();
      void guardar(c);
    } catch (e) {
      if (!vivo.current || meu !== seq.current) return;
      const agora = Date.now();
      falhaDesde.current ??= agora;
      if (agora - falhaDesde.current >= LIMITE_SEM_CONEXAO_MS) setSemConexaoDesde(falhaDesde.current);
      setErro(e instanceof Error ? e.message : String(e));
      setEstado("erro");
    }
  }, []);

  // Abertura instantânea: enquanto /api/dados não responde, mostra a última base salva neste
  // navegador, se for do mesmo usuário (papel e vínculos iguais).
  useEffect(() => {
    void (async () => {
      if (!memoriaBase().disponivel()) return;
      // Em paralelo: /api/eu é o mesmo pedido que a casca faz (compartilhado).
      const [salva, u] = await Promise.all([memoriaBase().ler<Corpo>(), obterUsuario()]);
      if (!vivo.current || respondeu.current || !u || !salva || salva.dono !== chaveDono(u)) return;
      try {
        const c = salva.corpo;
        if (typeof c?.linhas?.n !== "number" || typeof c.sinistros?.n !== "number") throw new Error("cópia inválida");
        setBase({ ...c, linhas: decodificarLinhas(c.linhas), sinistros: decodificarSinistros(c.sinistros) });
        setDaMemoriaDe(salva.salvoEm);
        setEstado((e) => (e === "carregando" ? "pronto" : e));
      } catch {
        void memoriaBase().apagar(); // cópia de um formato antigo ou corrompida
      }
    })();
  }, []);

  useEffect(() => {
    // Busca inicial: os setState acontecem só depois do await (assíncronos), não no corpo do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    vivo.current = true; // StrictMode: monta, desmonta e monta de novo
    const tick = setInterval(() => void carregar(), INTERVALO_REVALIDACAO_MS);
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar(); };
    const aoOnline = () => void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoOnline);
    return () => {
      vivo.current = false;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoOnline);
    };
  }, [carregar]);

  const recarregar = useCallback(() => void carregar(), [carregar]);
  return { estado, base, erro, recarregar, ultimaBoaEm, semConexaoDesde, daMemoriaDe };
}
