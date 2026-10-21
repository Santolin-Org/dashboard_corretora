"use client";
import { Fragment, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePainel } from "@/client/painel";
import { rotaDeVolta } from "@/client/exibicaoTv";
import { exibicaoTv, fVarPct, type CartaoNovos } from "@/domain/exibicao-tv";
import { fBRL, fN, fP } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { axisClr, gridClr, labelClr, PALETA } from "@/client/tema";
import { MetaDeFases, Podio } from "../crosssell/BlocoCampanha";
import { tvBarValueLabelPlugin } from "./plugin";
import type { CSSProperties } from "react";

const sp = " ";

// card de renderTvExMetaNovos: sem espaço entre cartões/linhas, com espaço entre as partes de cada cartão (como o template).
function Cartao({ c }: { c: CartaoNovos }) {
  return (
    <div className="msem-card" style={{ "--tc": c.cor } as CSSProperties}>
      {sp}
      <div className="msem-card-head"><span className="msem-dot" />{c.label}</div>
      {sp}
      <div className={`msem-pct ${c.pctCls}`}>{c.pctTxt}</div>
      {sp}
      <div className="msem-bar"><div className="msem-bar-fg" style={{ width: `${c.larguraPct}%` }} /></div>
      {sp}
      <div className="msem-nums">{fBRL(c.real)} <span className="msem-meta">/ {fBRL(c.meta)}</span></div>
      {sp}
      <div className={`msem-gap ${c.gap >= 0 ? "pos" : "neg"}`}>{c.gap >= 0 ? "+" : ""}{fBRL(c.gap)}</div>
      {sp}
    </div>
  );
}

// Exibição TV (#tv-exibicao; AbaSobDemanda cria o contêiner): tela cheia dedicada para rodar numa TV, sempre a carteira
// inteira (base.linhas), sem filtros de aba. No antigo era um overlay sobre a aba ativa; aqui é a rota /exibicao-tv.
// "✕" e Esc voltam para a aba de onde abriu, com os filtros (?f=). Os dados acompanham a revalidação do painel (a cada
// 5 min, token incluso) sem recarregar: `base` novo → cálculo novo → gráficos redesenhados só se os números mudaram.
export default function ExibicaoTv() {
  const { base } = usePainel();
  const router = useRouter();
  const linhas = base.linhas, hoje = base.hoje;
  const d = useMemo(() => exibicaoTv(linhas, hoje), [linhas, hoje]);

  const fechar = useCallback(() => { router.push(rotaDeVolta()); }, [router]);
  useEffect(() => {
    if (linhas.length) return;
    alert("Carregue os dados antes de abrir a exibição.");
    router.replace(rotaDeVolta());
  }, [linhas.length, router]);
  // tvExibicaoKeyHandler: Esc sai.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [fechar]);

  // As chaves dos gráficos vêm dos próprios números: uma revalidação que traz os mesmos dados não redesenha (a TV não pisca).
  const chaveAno = JSON.stringify(d.ano.data) + d.ano.labels.join();
  const chaveNivel = JSON.stringify(d.nivel.counts);
  return (
    <>
      <button type="button" className="tv-ex-exit" title="Sair (Esc)" onClick={fechar}>✕</button>
      {sp}
      <div className="tv-ex-grid">
        {sp}
        <div className="tv-ex-left">
          {sp}
          <div className="tv-ex-card">
            {sp}
            <div className="chart-top">
              {sp}
              <span className="chart-title">Meta mensal — Seguros novos</span>
              {sp}
              <span className="chart-badge" id="tv-ex-novos-badge">{d.novos.badge}</span>
              {sp}
            </div>
            {sp}
            <div className="tv-ex-novos-body" id="tv-ex-novos-body">
              {d.novos.linhas.map((l) => (
                <div key={l.metrica} className="msem-row tv-ex-novos-row">
                  <div className="msem-row-lbl">{l.rotulo}</div>
                  {l.cartoes.map((c) => <Cartao key={c.team} c={c} />)}
                </div>
              ))}
            </div>
            {sp}
          </div>
          {sp}
          <div className="tv-ex-santolin-bar" id="tv-ex-santolin-com"><MetaDeFases m={d.metasSantolin.com} /></div>
          {sp}
          <div className="tv-ex-card">
            {sp}
            <div className="chart-top">
              {sp}
              <span className="chart-title">Top 3 vendedores — Santolin 360</span>
              {sp}
              <span className="chart-badge" id="tv-ex-santolin-badge">{d.podio.badge}</span>
              {sp}
            </div>
            {sp}
            <div className="podium-grid tv-ex-santolin-podium" id="tv-ex-santolin-podium">
              {d.podio.vazio
                ? <div className="tv-ex-podium-empty">Nenhuma apólice da campanha Santolin 360 ainda.</div>
                : d.podio.colunas.map((c, i) => (
                  <Fragment key={c.titulo}>
                    {i > 0 ? sp : null}
                    <div className="podium-col">
                      {sp}
                      <div className="podium-title">{c.titulo}</div>
                      {sp}
                      <Podio nomes={c.nomes} />
                      {sp}
                    </div>
                  </Fragment>
                ))}
            </div>
            {sp}
          </div>
          {sp}
        </div>
        {sp}
        <div className="tv-ex-right">
          {sp}
          <div className="tv-ex-card">
            {sp}
            <div className="chart-top">
              {sp}
              <span className="chart-title">Carteira acumulada — apólices ativas por ano</span>
              {sp}
              <span className="chart-badge" id="tv-ex-ano-badge">{d.ano.badge}</span>
              {sp}
            </div>
            {sp}
            <div className="tv-ex-chart-wrap">
              <Grafico
                id="tv-ex-ano-chart" chave={chaveAno}
                construir={() => {
                  const ac = axisClr(), lc = labelClr(), gc = gridClr();
                  const { labels, data } = d.ano;
                  return {
                    type: "bar",
                    data: {
                      labels,
                      datasets: [
                        { type: "bar", label: "Apólices", data, backgroundColor: "#4E80FF", borderRadius: 4, order: 2 },
                        { type: "line", label: "Tendência", data, borderColor: "rgb(238 34 34 / 0.95)", borderWidth: 3, pointRadius: 0, tension: 0.3, fill: false, order: 1 },
                      ],
                    },
                    options: {
                      responsive: true, maintainAspectRatio: false,
                      // 44 (e não 24) porque agora são duas linhas de rótulo acima da barra mais
                      // alta: o valor e, acima dele, a variação contra o ano anterior.
                      layout: { padding: { top: 44 } },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => fN(ctx.raw as number) + " apólices",
                            afterLabel: (ctx) => {
                              if (ctx.datasetIndex !== 0 || ctx.dataIndex === 0) return "";
                              const prev = ctx.dataset.data[ctx.dataIndex - 1] as number | null;
                              if (prev == null || prev === 0) return "";
                              const diff = (ctx.raw as number) - prev;
                              return `${fVarPct(diff / prev)} vs. ${ctx.chart.data.labels?.[ctx.dataIndex - 1]} (${diff >= 0 ? "+" : "−"}${fN(Math.abs(diff))})`;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { ticks: { color: lc, font: { size: 12 } }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { color: ac, font: { size: 11 }, precision: 0 }, grid: { color: gc } },
                      },
                    },
                    plugins: [tvBarValueLabelPlugin(0, { variacao: true })],
                  };
                }}
              />
            </div>
            {sp}
          </div>
          {sp}
          <div className="tv-ex-santolin-bar" id="tv-ex-santolin-qtd"><MetaDeFases m={d.metasSantolin.qtd} /></div>
          {sp}
          <div className="tv-ex-card">
            {sp}
            <div className="chart-top">
              {sp}
              <span className="chart-title">Clientes por nível</span>
              {sp}
              <span className="chart-badge" id="tv-ex-nivel-badge">{d.nivel.badge}</span>
              {sp}
            </div>
            {sp}
            <div className="tv-ex-chart-wrap">
              <Grafico
                id="tv-ex-nivel-chart" chave={chaveNivel}
                construir={() => {
                  const ac = axisClr(), lc = labelClr(), gc = gridClr();
                  const { labels, counts, total } = d.nivel;
                  return {
                    type: "bar",
                    data: { labels, datasets: [{ data: counts, backgroundColor: PALETA.slice(0, 4), borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.7 }] },
                    options: {
                      responsive: true, maintainAspectRatio: false,
                      layout: { padding: { top: 24 } },
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => fN(ctx.raw as number) + " clientes (" + fP(total ? (ctx.raw as number) / total : 0) + ")" } },
                      },
                      scales: {
                        x: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { color: ac, font: { size: 11 }, precision: 0 }, grid: { color: gc } },
                      },
                    },
                    plugins: [tvBarValueLabelPlugin(0)],
                  };
                }}
              />
            </div>
            {sp}
          </div>
          {sp}
        </div>
        {sp}
      </div>
    </>
  );
}
