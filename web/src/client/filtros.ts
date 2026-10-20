"use client";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { Linha } from "@/domain/tipos";
import { FILTROS_VAZIOS, filtrarLinhas, opcoesFiltros, tiposDisponiveis, type FiltrosGlobais } from "@/domain/filtros";

// Estado global dos filtros, compartilhado entre as rotas das abas (contexto montado no
// layout do painel) e persistido na URL em ?f=<json com os campos não vazios>.
//
// Fidelidade ao app antigo (main.js):
//  - Ao carregar, FD = ALL (initDashboard), sem passar pelo applyFilters — inclusive as
//    faturas de saúde que o applyFilters sem tipo descarta. O mesmo vale depois de
//    "Limpar filtros" (resetFilters: FD = [...ALL]). Só uma mudança de filtro passa a
//    usar filtrarLinhas.
//  - #rec-badge mostra "0 registros" na carga inicial (updateDashHeader roda antes de FD
//    ser preenchido); a contagem aparece depois da primeira mudança de filtro ou limpeza.
//    Ver web/docs/divergencias.md.
//  - As opções de colaborador são remontadas só quando as datas mudam (buildColabOptions),
//    com os marcados daquele momento; marcar/desmarcar não remonta a lista.

type Modo = "inicial" | "filtrado" | "limpo";
type Estado = { filtros: FiltrosGlobais; modo: Modo; colRemontagem: string[]; geracaoLimpeza: number };

export type ValorFiltros = {
  filtros: FiltrosGlobais;
  definir(p: Partial<FiltrosGlobais>): void;
  limpar(): void;
  /** FD do app antigo. */
  fd: Linha[];
  /** true depois que algum filtro foi aplicado (FD passou por filtrarLinhas). */
  aplicado: boolean;
  /** Ainda na carga inicial (nenhum filtro aplicado nem limpo): #rec-badge mostra a contagem de updateDashHeader. */
  inicial: boolean;
  /** Número de #rec-badge ("N registros"): 0 na carga inicial (quirk do app antigo), depois fd.length. */
  recBadgeContagem: number;
  opcoes: { col: string[]; grp: string[]; ram: string[]; seg: string[] };
  tipos: string[];
  /**
   * Contador incrementado a cada limpar() (resetFilters do app antigo). As abas o observam para zerar
   * o que o resetFilters zerava no antigo (hoje: a seleção de motivos de cancelamento da Visão geral).
   */
  geracaoLimpeza: number;
};

const Contexto = createContext<ValorFiltros | null>(null);

const DATAS = ["vigIni", "vigFim", "emIni", "emFim"] as const;
const LISTAS = ["tipos", "col", "grp", "ram", "seg"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function codificarFiltros(f: FiltrosGlobais): string {
  const o: Record<string, unknown> = {};
  for (const k of DATAS) if (f[k]) o[k] = f[k];
  for (const k of LISTAS) if (f[k].length) o[k] = f[k];
  return Object.keys(o).length ? JSON.stringify(o) : "";
}

export function decodificarFiltros(s: string | null): FiltrosGlobais | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const f: FiltrosGlobais = { ...FILTROS_VAZIOS };
    for (const k of DATAS) if (typeof o[k] === "string" && ISO.test(o[k] as string)) f[k] = o[k] as string;
    for (const k of LISTAS) {
      const v = o[k];
      if (Array.isArray(v)) f[k] = [...new Set(v.filter((x): x is string => typeof x === "string"))];
    }
    return codificarFiltros(f) ? f : null;
  } catch {
    return null;
  }
}

export function FiltrosProvider({ linhas, children }: { linhas: Linha[]; children: ReactNode }) {
  const params = useSearchParams();
  const [estado, setEstado] = useState<Estado>(() => {
    const daUrl = decodificarFiltros(params.get("f"));
    return daUrl
      ? { filtros: daUrl, modo: "filtrado", colRemontagem: daUrl.col, geracaoLimpeza: 0 }
      : { filtros: FILTROS_VAZIOS, modo: "inicial", colRemontagem: [], geracaoLimpeza: 0 };
  });

  const definir = useCallback((p: Partial<FiltrosGlobais>) => {
    setEstado((e) => {
      const filtros = { ...e.filtros, ...p };
      const mudouData = DATAS.some((k) => k in p && p[k] !== e.filtros[k]);
      return { filtros, modo: "filtrado", colRemontagem: mudouData ? filtros.col : e.colRemontagem, geracaoLimpeza: e.geracaoLimpeza };
    });
  }, []);
  const limpar = useCallback(() => setEstado((e) => ({ filtros: FILTROS_VAZIOS, modo: "limpo", colRemontagem: [], geracaoLimpeza: e.geracaoLimpeza + 1 })), []);

  // Persistência na URL (?f=), preservando o resto do endereço.
  useEffect(() => {
    const url = new URL(window.location.href);
    const cod = codificarFiltros(estado.filtros);
    if ((url.searchParams.get("f") ?? "") === cod) return;
    if (cod) url.searchParams.set("f", cod);
    else url.searchParams.delete("f");
    window.history.replaceState(window.history.state, "", url);
  }, [estado.filtros]);

  const { filtros, modo, colRemontagem, geracaoLimpeza } = estado;
  const fd = useMemo(() => (modo === "filtrado" ? filtrarLinhas(linhas, filtros) : linhas), [linhas, filtros, modo]);
  const datas = `${filtros.vigIni}|${filtros.vigFim}|${filtros.emIni}|${filtros.emFim}`;
  const opcoes = useMemo(
    () => opcoesFiltros(linhas, { ...FILTROS_VAZIOS, ...pegarDatas(datas), col: colRemontagem }),
    [linhas, datas, colRemontagem],
  );
  const tipos = useMemo(() => tiposDisponiveis(linhas), [linhas]);

  const valor = useMemo<ValorFiltros>(() => ({
    filtros, definir, limpar, fd, aplicado: modo === "filtrado", inicial: modo === "inicial",
    recBadgeContagem: modo === "inicial" ? 0 : fd.length,
    opcoes, tipos, geracaoLimpeza,
  }), [filtros, definir, limpar, fd, modo, opcoes, tipos, geracaoLimpeza]);

  return createElement(Contexto.Provider, { value: valor }, children);
}

function pegarDatas(s: string): Pick<FiltrosGlobais, "vigIni" | "vigFim" | "emIni" | "emFim"> {
  const [vigIni, vigFim, emIni, emFim] = s.split("|");
  return { vigIni, vigFim, emIni, emFim };
}

export function useFiltros(): ValorFiltros {
  const v = useContext(Contexto);
  if (!v) throw new Error("useFiltros fora do FiltrosProvider");
  return v;
}
