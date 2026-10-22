"use client";
import { useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Grafico } from "@/components/Grafico";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { axisClr, gridClr } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import { fBRL, fP, fShort } from "@/domain/formatos";
import {
  META_TEAMS, METAS_SEM_TEAM_COLOR, METAS_SEM_TEAM_LBL, graficoSemanal, pctClsMeta, tabelaSemanal,
  type DadosSemanal, type EquipeMeta, type MetricaSemana,
} from "@/domain/metas-semanal";
import type { EstadoMetas } from "./estado";

const sp = " ";
type Com = Extract<DadosSemanal, { hasPeriod: true }>;

// teamCard / metricRow de renderMetasSemanal: cada cartão é clicável e foca o gráfico/tabela naquela equipe + métrica.
function Cartao({ d, t, m, e }: { d: Com; t: EquipeMeta; m: MetricaSemana; e: EstadoMetas }) {
  const tt = d.totals[t];
  const real = tt[m === "comissao" ? "realCom" : "realPremio"], meta = tt[m === "comissao" ? "metaCom" : "metaPremio"];
  const pct = meta ? real / meta : 0, gap = real - meta;
  const pctClamp = Math.max(0, Math.min(1, pct));
  const ativo = t === e.equipe && m === e.metrica;
  return (
    <div className={`msem-card${ativo ? " active" : ""}`} style={{ "--tc": METAS_SEM_TEAM_COLOR[t] } as CSSProperties} onClick={() => e.setCartao(t, m)}>
      {sp}
      <div className="msem-card-head"><span className="msem-dot" />{METAS_SEM_TEAM_LBL[t]}</div>
      {sp}
      <div className={`msem-pct ${pctClsMeta(pct)}`}>{fP(pct)}</div>
      {sp}
      <div className="msem-bar"><div className="msem-bar-fg" style={{ width: `${(pctClamp * 100).toFixed(1)}%` }} /></div>
      {sp}
      <div className="msem-nums">{fBRL(real)} <span className="msem-meta">/ {fBRL(meta)}</span></div>
      {sp}
      <div className={`msem-gap ${gap >= 0 ? "pos" : "neg"}`}>{gap >= 0 ? "+" : ""}{fBRL(gap)}</div>
      {sp}
    </div>
  );
}
function Linha({ d, m, rotulo, e }: { d: Com; m: MetricaSemana; rotulo: string; e: EstadoMetas }) {
  return (
    <div className="msem-row">
      {sp}
      <div className="msem-row-lbl">{rotulo}</div>
      {sp}
      {META_TEAMS.map((t) => <Cartao key={t} d={d} t={t} m={m} e={e} />)}
      {sp}
    </div>
  );
}

function Tabela({ d, e }: { d: Com; e: EstadoMetas }) {
  const team = e.equipe;
  const t = useMemo(() => tabelaSemanal(d, team, e.metrica), [d, team, e.metrica]);
  return (
    <table className="prod-table msem-table">
      <thead>
        <tr><th>Semana</th><th>Período</th><th className="num">Dias</th><th className="num">Realizado</th><th className="num">Meta</th><th className="num">% meta</th><th className="num">Acum. real.</th><th className="num">Acum. meta</th><th className="num">% acum.</th></tr>
      </thead>
      <tbody>
        {t.linhas.map((l) => (
          <tr key={l.semana.idx}>
            <td>{l.semana.label}</td><td style={{ color: "var(--text-tertiary)" }}>{l.semana.periodoLabel}</td><td className="num">{l.semana.days}</td>
            <td className="num">{fBRL(l.real)}</td><td className="num">{fBRL(l.meta)}</td><td className={`num ${pctClsMeta(l.pct)}`}>{fP(l.pct)}</td>
            <td className="num">{fBRL(l.acReal)}</td><td className="num">{fBRL(l.acMeta)}</td><td className={`num ${pctClsMeta(l.pctAc)}`}>{fP(l.pctAc)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total {METAS_SEM_TEAM_LBL[team]}</td><td className="num">{t.totDias}</td><td className="num">{fBRL(t.totReal)}</td><td className="num">{fBRL(t.totMeta)}</td>
          <td className={`num ${pctClsMeta(t.totPct)}`}>{fP(t.totPct)}</td><td className="num">{fBRL(t.totReal)}</td><td className="num">{fBRL(t.totMeta)}</td><td className={`num ${pctClsMeta(t.totPct)}`}>{fP(t.totPct)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// #sc-metas-semanal: cartões-resumo (#metas-sem-mtd), gráfico ch-metas-semanal e tabela (#metas-sem-table-wrap) da
// equipe/métrica focadas. Sem as duas pontas da vigência: a dica, o gráfico some e o badge fica vazio. O botão
// "▶ Modo apresentação" (openKickoff): abre a rota /apresentacao com os filtros (?f=); sem dados, o alerta do antigo.
export function BlocoSemanal({ dados, temDados, e }: { dados: DadosSemanal; temDados: boolean; e: EstadoMetas }) {
  const com = temDados && dados.hasPeriod ? dados : null;
  const g = useMemo(() => (com ? graficoSemanal(com.weeks, e.equipe, e.metrica) : null), [com, e.equipe, e.metrica]);
  const router = useRouter();
  const abrirApresentacao = () => {
    if (!temDados) { alert("Carregue os dados antes de gerar a apresentação."); return; }
    router.push(`/apresentacao${window.location.search}`);
  };
  const badge = com ? `${com.weeks.length} semanas · ${e.metrica === "comissao" ? "Comissão" : "Prêmio"}` : "";
  return (
    <SecaoRecolhivel
      chave="metas-semanal"
      cabecalho={<SecaoTitulo>Acompanhamento semanal{" "}<SecaoBadge id="metas-semanal-badge">{badge}</SecaoBadge></SecaoTitulo>}
      controles={<button type="button" className="kickoff-btn" title="Gerar apresentação de kickoff semanal" onClick={abrirApresentacao}>▶ Modo apresentação</button>}
    >
      <div className="metas-sem-mtd" id="metas-sem-mtd">
        {com ? (
          <>
            <Linha d={com} m="premio" rotulo="Prêmio" e={e} />
            <Linha d={com} m="comissao" rotulo="Comissão" e={e} />
          </>
        ) : temDados ? <div className="metas-sem-hint">Selecione um período de vigência (ex.: o mês atual) para ver o acompanhamento semanal.</div> : null}
      </div>
      {" "}
      <div style={{ padding: "4px 16px 8px" }}>
        {com && g ? (
          <Grafico
            id="ch-metas-semanal" altura={260} chave={idObjeto(g)}
            construir={() => {
              const ac = axisClr(), gc = gridClr(), tc = g.cor;
              return {
                type: "bar",
                data: {
                  labels: g.labels,
                  datasets: [
                    { label: "Realizado", data: g.real, backgroundColor: tc, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.62 },
                    { label: "Meta", data: g.meta, backgroundColor: tc + "2e", borderColor: tc, borderWidth: 1.5, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.62 },
                  ],
                },
                options: {
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                    legend: { display: true, labels: { color: ac, boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ctx.dataset.label + ": " + fBRL(ctx.raw as number),
                        afterBody: (items) => {
                          const i = items[0].dataIndex, w = com.weeks[i];
                          const r = g.real[i], m = g.meta[i];
                          return "% meta: " + fP(m ? r / m : 0) + "  ·  " + w.periodoLabel + " (" + w.days + "d)";
                        },
                      },
                    },
                  },
                  scales: {
                    x: { ticks: { color: ac, font: { size: 11 } }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: ac, font: { size: 10 }, callback: (v) => fShort(Number(v)) }, grid: { color: gc } },
                  },
                },
              };
            }}
          />
        ) : (
          <div className="cw" style={{ height: 260 }}><canvas id="ch-metas-semanal" /></div>
        )}
      </div>
      {" "}
      <div className="prod-table-wrap" id="metas-sem-table-wrap">{com ? <Tabela d={com} e={e} /> : null}</div>
    </SecaoRecolhivel>
  );
}
