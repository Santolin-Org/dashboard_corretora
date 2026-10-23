"use client";
import { useMemo } from "react";
import type { ChartConfiguration, Plugin } from "chart.js";
import { usePainel } from "@/client/painel";
import { axisClr } from "@/client/tema";
import { comparativoNR, fMil, mesDe, nomeMes } from "@/domain/painel-produtor";
import { fBRL, fN } from "@/domain/formatos";
import { Grafico } from "../Grafico";
import s from "./PainelProdutor.module.css";

const COR_N = "#4E80FF", COR_R = "#A78BFA", COR_OUTROS = "#7888A8";

// Valor escrito dentro de cada segmento ("N R$ 15,8 mil"); some quando não cabe.
const rotulosSegmentos: Plugin<"bar"> = {
  id: "ppRotulosNR",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0b0f18";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      const prefixo = (ds as { prefixo?: string }).prefixo ?? "";
      meta.data.forEach((el, j) => {
        const v = ds.data[j] as number;
        if (!v) return;
        const { x, y, base } = el.getProps(["x", "y", "base"], true) as { x: number; y: number; base: number };
        const texto = `${prefixo} ${fMil(v)}`;
        if (ctx.measureText(texto).width + 8 > Math.abs(x - base)) return;
        ctx.fillText(texto, (x + base) / 2, y);
      });
    });
    ctx.restore();
  },
};

/** 4.1 — números do mês corrente e N+R contra o mesmo mês do ano anterior (prêmio líquido). */
export function BlocoProducaoMes({ nomes, prefixoTitulo = "Minha produção" }: { nomes: ReadonlySet<string>; prefixoTitulo?: string }) {
  const { base } = usePainel();
  const mes = mesDe(base.hoje);
  const { atual, anterior, variacao } = useMemo(() => comparativoNR(base.linhas, nomes, mes), [base, nomes, mes]);
  const mesAnt = anterior.mes;
  const temOutros = atual.outros.qtd > 0 || anterior.outros.qtd > 0;
  const vazio = atual.total.qtd === 0 && anterior.total.qtd === 0;
  const barras = [anterior, atual];
  const series = [
    { label: "Novas (N)", prefixo: "N", cor: COR_N, data: barras.map((b) => b.novas.premio) },
    { label: "Renovações (R)", prefixo: "R", cor: COR_R, data: barras.map((b) => b.renov.premio) },
    ...(temOutros ? [{ label: "Outros", prefixo: "O", cor: COR_OUTROS, data: barras.map((b) => b.outros.premio) }] : []),
  ];

  return (
    <section className={s.card} aria-labelledby="pp-producao-titulo">
      <h2 id="pp-producao-titulo">{prefixoTitulo} em {nomeMes(mes)}</h2>
      <div className={s.sub}>Prêmio líquido, novas (N) + renovações (R), contra {nomeMes(mesAnt, "ano")}</div>
      <div className={s.kpis} role="group" aria-label="Números do mês">
        <div className={s.kpi}><small>Apólices</small><strong>{fN(atual.total.qtd)}</strong></div>
        <div className={s.kpi}><small>Prêmio líquido</small><strong>{fBRL(atual.total.premio)}</strong></div>
        <div className={s.kpi}><small>Comissão</small><strong>{fBRL(atual.total.com)}</strong></div>
      </div>
      {vazio ? (
        <p className={s.vazio}>Nenhuma produção em {nomeMes(mes)} nem em {nomeMes(mesAnt, "ano")}.</p>
      ) : (
        <>
          <Grafico id="pp-nr" altura={110} chave={JSON.stringify(series.map((x) => x.data)) + mes}
            construir={(): ChartConfiguration => ({
              type: "bar",
              data: {
                labels: barras.map((b) => nomeMes(b.mes, "abrev")),
                datasets: series.map((x) => ({
                  label: x.label, prefixo: x.prefixo, data: x.data, backgroundColor: x.cor, borderRadius: 4, borderSkipped: false,
                  barPercentage: 0.9, categoryPercentage: 0.9,
                })),
              },
              options: {
                indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fBRL(c.parsed.x ?? 0)}` } } },
                scales: {
                  x: { stacked: true, display: false },
                  y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: axisClr(), font: { size: 11 } } },
                },
              },
              plugins: [rotulosSegmentos as Plugin],
            })} />
          <div className={s.totais}>
            {barras.map((b) => (
              <div key={b.mes}><span>{nomeMes(b.mes, "abrev")}</span>Total {fBRL(b.total.premio)} · comissão {fBRL(b.total.com)}</div>
            ))}
          </div>
        </>
      )}
      {variacao !== null && (
        <span className={`${s.selo} ${variacao >= 0 ? s.sobe : s.cai}`}>
          {variacao >= 0 ? "▲" : "▼"} {(Math.abs(variacao) * 100).toFixed(1).replace(".", ",")}% sobre {nomeMes(mesAnt, "ano")}
        </span>
      )}
      <div className={s.legenda}>
        {series.map((x) => <span key={x.label} style={{ ["--c" as string]: x.cor }}>{x.label}</span>)}
      </div>
    </section>
  );
}
