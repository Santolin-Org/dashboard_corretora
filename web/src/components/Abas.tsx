"use client";
import { usePathname, useRouter } from "next/navigation";
import s from "./Abas.module.css";

export const ABAS = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "producao", rotulo: "Produção" },
  { id: "retencao", rotulo: "Retenção & Churn" },
  { id: "crosssell", rotulo: "Cross-sell" },
  { id: "comparativo", rotulo: "Comparativo" },
  { id: "metas", rotulo: "Metas" },
  { id: "sinistros", rotulo: "Sinistros" },
] as const;
export type AbaId = (typeof ABAS)[number]["id"];

/** Abas que dependem da produção (PROD_TABS do main.js). */
export const ABAS_PRODUCAO: readonly string[] = ["visao-geral", "producao", "retencao", "comparativo", "metas", "crosssell"];

/** .nav-tabs: cada aba é uma rota; o ?f= dos filtros acompanha a navegação. */
export function Abas() {
  const router = useRouter();
  const atual = usePathname().split("/")[1];
  return (
    <div className={`${s.navTabs} nav-tabs`}>
      {ABAS.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`${s.tabBtn} tab-btn${a.id === atual ? " active" : ""}`}
          data-aba={a.id}
          onMouseEnter={() => router.prefetch(`/${a.id}`)}
          onClick={() => router.push(`/${a.id}${window.location.search}`)}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
