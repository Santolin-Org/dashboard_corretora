"use client";
import type { ChartConfiguration } from "chart.js";
import { Grafico } from "@/components/Grafico";
import { fBRL, fP, fShort } from "@/domain/formatos";
import { KF_GOLD, KF_GREEN, dadosGraficoEquipe, dadosGraficosSemanas, type Slide, type SlideEquipe, type SlideSemanas } from "@/domain/apresentacao";
import { METAS_SEM_TEAM_LBL } from "@/domain/metas-semanal";
import { kfBarLabelPlugin, kfWeeksLabelPlugin } from "./plugins";

// kfSlideHtml e os renderizadores de gráfico (main.js 4122–4270). Os espaços entre blocos reproduzem os do template do
// antigo (o harness compara o textContent). O gráfico é sempre claro, independente do tema.

function configEquipe(s: SlideEquipe): ChartConfiguration {
  const d = dadosGraficoEquipe(s);
  return {
    type: "bar",
    data: {
      labels: d.labels,
      datasets: [
        { label: "Meta", data: d.meta, backgroundColor: KF_GOLD, borderRadius: 3, categoryPercentage: 0.78, barPercentage: 0.94 },
        { label: "Realizado", data: d.real, backgroundColor: KF_GREEN, borderRadius: 3, categoryPercentage: 0.78, barPercentage: 0.94 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 80, left: 4 } },
      plugins: {
        legend: { position: "top", align: "center", labels: { color: "#2B2733", font: { size: 14, weight: 600 }, boxWidth: 12, usePointStyle: true, pointStyle: "circle", padding: 18 } },
        tooltip: { enabled: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#6a6680", font: { size: 12 }, callback: (v) => fShort(Number(v)) }, grid: { color: "#E4E2EE" } },
        y: { ticks: { color: "#2B2733", font: { size: 17, weight: 600 } }, grid: { display: false } },
      },
    },
    plugins: [kfBarLabelPlugin],
  } as ChartConfiguration;
}

function configSemanas(d: ReturnType<typeof dadosGraficosSemanas>, meta: number[], real: number[]): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: d.labels,
      datasets: [
        { label: "Esperado", data: meta, backgroundColor: KF_GOLD, borderRadius: 3, categoryPercentage: 0.72, barPercentage: 0.92 },
        { label: "Realizado", data: real, backgroundColor: KF_GREEN, borderRadius: 3, categoryPercentage: 0.72, barPercentage: 0.92 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      plugins: {
        legend: { position: "top", labels: { color: "#2B2733", font: { size: 12, weight: 600 }, boxWidth: 10, usePointStyle: true, pointStyle: "circle", padding: 12 } },
        tooltip: { enabled: false },
      },
      scales: {
        x: { ticks: { color: "#2B2733", font: { size: 13, weight: 600 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: "#6a6680", font: { size: 11 }, callback: (v) => fShort(Number(v)) }, grid: { color: "#E4E2EE" } },
      },
    },
    plugins: [kfWeeksLabelPlugin],
  } as ChartConfiguration;
}

function SlideEquipeView({ s, gen }: { s: SlideEquipe; gen: number }) {
  return (
    <div className="kf-page kf-page--light kf-teamslide">
      <div className="kf-ts-head">
        <div className="kf-ts-left">
          <div className="kf-ts-obj"><span className="kf-ts-objbar"></span>Nossos<br /><strong>objetivos</strong></div>
          {" "}
          <div className="kf-ts-team">{METAS_SEM_TEAM_LBL[s.team]}</div>
        </div>
        {" "}
        <div className="kf-ts-center">
          <div className="kf-ts-sub">{s.sub}</div>
          {" "}
          <div className="kf-ts-period">{s.period}</div>
          {" "}
          <div className="kf-ts-cap">{s.caption}</div>
        </div>
        {" "}
        {s.ref ? (
          <div className="kf-ts-ref">
            {" "}
            <div><b>Prêmio/{s.ref.ano}:</b> {fBRL(s.ref.p25)}</div>
            {" "}
            <div><b>Comissão/{s.ref.ano}:</b> {fBRL(s.ref.c25)}</div>
            {" "}
            <div><b>% Médio:</b> {fP(s.ref.pct)}</div>
            {" "}
          </div>
        ) : <div className="kf-ts-ref"></div>}
      </div>
      {" "}
      <div className="kf-chart-wrap"><Grafico id="ch-kickoff" chave={gen} construir={() => configEquipe(s)} /></div>
    </div>
  );
}

function SlideSemanasView({ s, gen }: { s: SlideSemanas; gen: number }) {
  const d = dadosGraficosSemanas(s);
  return (
    <div className="kf-page kf-page--light kf-weekslide">
      <div className="kf-ts-head">
        <div className="kf-ts-left">
          <div className="kf-ts-obj"><span className="kf-ts-objbar"></span>Nossa<br /><strong>evolução</strong></div>
          {" "}
          <div className="kf-ts-team">{METAS_SEM_TEAM_LBL[s.team]}</div>
        </div>
        {" "}
        <div className="kf-ts-center">
          <div className="kf-ts-sub">Evolução semanal</div>
          {" "}
          <div className="kf-ts-period">{s.mes}</div>
          {" "}
          <div className="kf-ts-cap">Realizado vs. esperado</div>
        </div>
        {" "}
        <div className="kf-ts-ref"></div>
      </div>
      {" "}
      <div className="kf-weeks-charts">
        <div className="kf-weeks-col"><div className="kf-weeks-title">Prêmio</div><div className="kf-weeks-cv"><Grafico id="ch-kfw-p" chave={gen} construir={() => configSemanas(d, d.pMeta, d.pReal)} /></div></div>
        {" "}
        <div className="kf-weeks-col"><div className="kf-weeks-title">Comissão</div><div className="kf-weeks-cv"><Grafico id="ch-kfw-c" chave={gen} construir={() => configSemanas(d, d.cMeta, d.cReal)} /></div></div>
      </div>
    </div>
  );
}

/** `gen` muda a cada redesenho do slide (como o renderKickoffSlide do antigo, que destrói e recria os gráficos). */
export function SlideView({ s, gen }: { s: Slide; gen: number }) {
  if (s.type === "weekschart") return <SlideSemanasView s={s} gen={gen} />;
  if (s.type === "cover") {
    return (
      <div className="kf-page kf-page--brand kf-cover2">
        <div className="kf-brand-mark"></div>
        {" "}
        <div className="kf-cover2-eyebrow">Reunião de</div>
        {" "}
        <div className="kf-cover2-title">Kick-off</div>
        {" "}
        <div className="kf-cover2-mes">{s.mes}</div>
      </div>
    );
  }
  if (s.type === "divider") {
    return (
      <div className="kf-page kf-page--brand kf-divider">
        <div className="kf-div-1">{s.l1}</div>
        {" "}
        <div className="kf-div-2">{s.l2}</div>
        {" "}
        <div className="kf-div-3">{s.l3}</div>
      </div>
    );
  }
  if (s.type === "closing") {
    return (
      <div className="kf-page kf-page--brand kf-closing">
        <div className="kf-brand-mark"></div>
        {" "}
        <div className="kf-closing-bar"></div>
        {" "}
        <div className="kf-closing-txt">{s.text}</div>
      </div>
    );
  }
  return <SlideEquipeView s={s} gen={gen} />;
}
