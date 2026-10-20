"use client";
import { useMemo, useRef } from "react";
import type { Linha } from "@/domain/tipos";
import { adicionarPeriodo, removerPeriodo, serieProducao, validarPeriodo, type Periodo } from "@/domain/producao-aba";
import type { Metrica } from "@/domain/visao-geral";
import { fBRL, fShort } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { axisClr, gridClr } from "@/client/tema";
import { useEstadoAba } from "@/client/estadoAbas";
import { idObjeto } from "@/client/versao";
import { ToggleMetrica } from "../visao-geral/ToggleMetrica";
import s from "./Producao.module.css";

// #sc-chart: evolução da produção, com rádio mt-prod e seletor de períodos (addPeriod/removePeriod/clearPeriods).
// `periods` do app antigo é global: só zera ao recarregar os dados (initDashboard), não no "Limpar filtros".
export function BlocoEvolucao({ fd, todas, hoje }: { fd: Linha[]; todas: Linha[]; hoje: string }) {
  const [metrica, setMetrica] = useEstadoAba<Metrica>("producao:mt-prod", "premio"); // mt-prod-p marcado de início
  const [periodos, setPeriodos] = useEstadoAba<Periodo[]>("producao:periodos", []);
  const ini = useRef<HTMLInputElement>(null), fim = useRef<HTMLInputElement>(null);
  const serie = useMemo(() => serieProducao(fd, todas, periodos, metrica, hoje), [fd, todas, periodos, metrica, hoje]);

  const adicionar = () => {
    const a = ini.current?.value ?? "", b = fim.current?.value ?? "";
    const erro = validarPeriodo(periodos, a, b);
    if (erro) { alert(erro); return; }
    setPeriodos(adicionarPeriodo(periodos, a, b));
    if (ini.current) ini.current.value = "";
    if (fim.current) fim.current.value = "";
  };

  return (
    <SecaoRecolhivel
      chave="chart"
      cabecalho={<SecaoTitulo>Evolução da produção{" "}<SecaoBadge>comparar períodos</SecaoBadge></SecaoTitulo>}
      controles={<ToggleMetrica nome="mt-prod" valor={metrica} aoMudar={setMetrica} />}
    >
      <div className={`${s.periodRow} period-row`}>
        <span style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>Adicionar período:</span>
        {" "}
        <div className={`${s.datePair} date-pair`}>
          <input type="date" id="period-start" ref={ini} style={{ minWidth: 120, padding: "4px 8px", fontSize: 11 }} />
          <span className={`${s.dateSep} date-sep`}>&#8594;</span>
          <input type="date" id="period-end" ref={fim} style={{ minWidth: 120, padding: "4px 8px", fontSize: 11 }} />
        </div>
        {" "}
        <button type="button" className="btn-sm" onClick={adicionar} style={{ fontSize: 11, whiteSpace: "nowrap" }}>+ Adicionar</button>
        {" "}
        <div id="period-tags" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
          {periodos.map((p, i) => (
            <div key={i} className={`${s.periodTag} period-tag`}>
              <span className={`${s.ptDot} pt-dot`} style={{ background: p.color }} />
              <span className={`${s.ptLabel} pt-label`}>{p.label}</span>
              <span className={`${s.ptRemove} pt-remove`} onClick={() => setPeriodos(removerPeriodo(periodos, i))}>×</span>
            </div>
          ))}
        </div>
        {" "}
        <button type="button" className="btn-sm" onClick={() => setPeriodos([])} style={{ fontSize: 11, color: "#E24B4A", borderColor: "#E24B4A", background: "transparent" }}>Limpar períodos</button>
      </div>
      {" "}
      <div className={`${s.periodLegend} period-legend`} id="period-legend">
        {serie.legenda.map((l, i) => l.cor
          ? <span key={i}><span className="leg-dot" style={{ background: l.cor, display: "inline-block" }} />{l.texto}</span>
          : <span key={i} style={{ fontSize: 10, opacity: 0.5 }}>{l.texto}</span>)}
      </div>
      {" "}
      <div style={{ padding: "0 16px 16px" }}>
        <Grafico
          id="ch-prod-line" chave={idObjeto(serie)} altura={270}
          construir={() => {
            const ac = axisClr(), gc = gridClr();
            return {
              type: "line",
              data: {
                labels: serie.rotulos,
                datasets: serie.datasets.map((d) => d.tipo === "atual"
                  ? { label: d.label, data: d.data, borderColor: d.cor, backgroundColor: "rgba(99,153,34,0.07)", fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2.5 }
                  : d.tipo === "anterior"
                    ? { label: d.label, data: d.data, borderColor: d.cor, backgroundColor: "rgba(226,75,74,0.04)", fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2, borderDash: [6, 3] }
                    : { label: d.label, data: d.data, borderColor: d.cor, backgroundColor: d.cor + "15", fill: false, tension: 0.35, pointRadius: 3, borderWidth: 2.5 }),
              },
              options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ": " + fBRL(ctx.raw as number) } } },
                scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 }, callback: (v) => fShort(v as number) }, grid: { color: gc } } },
              },
            };
          }}
        />
      </div>
    </SecaoRecolhivel>
  );
}
