"use client";
import { Fragment, useMemo } from "react";
import type { Linha } from "@/domain/tipos";
import { campanha360, type MetaFases } from "@/domain/crosssell";
import { SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { FotoColaborador } from "@/components/FotoColaborador";
import { fotoDoColaborador } from "@/client/fotosColaboradores";

// renderTierGoal: barra de meta de 3 fases (também usada na Exibição TV).
export function MetaDeFases({ m }: { m: MetaFases }) {
  return (
    <div className="tier-goal">
      <div className="tier-goal-header">
        <span className="tier-goal-title">{m.label}</span>
        {" "}
        <span className="tier-goal-value">{m.valor}{" "}<span className="tier-goal-meta">/ {m.metaFinal}</span></span>
      </div>
      {" "}
      <div className="tier-goal-track">
        <div className="tier-goal-fill" style={{ width: `${m.larguraPct}%` }} />
        {" "}
        {m.marcadores.map((k) => (
          <div key={k.fase} className={`tier-marker ${k.atingida ? "reached" : ""}`} style={{ left: `${k.pos}%` }}><span>Fase {k.fase}<br />{k.valor}</span></div>
        ))}
      </div>
      {" "}
      <div className="tier-goal-badge">{m.badge}</div>
    </div>
  );
}

// renderPodium: só os nomes, 2º à esquerda, 1º no centro, 3º à direita. Com `colabs` (nome completo de cada
// colocado, painéis da TV com foto), cada degrau ganha a foto do colaborador — o pódio do antigo não tinha.
export function Podio({ nomes, colabs }: { nomes: [string, string, string]; colabs?: [string | null, string | null, string | null] }) {
  const passo = (i: number, cls: string, rank: string) => (
    <div className={`podium-step ${cls}`}>
      {colabs?.[i] ? <FotoColaborador colab={colabs[i]!} url={fotoDoColaborador(colabs[i]!)} /> : null}
      <div className="podium-name" title={nomes[i]}>{nomes[i]}</div>
      {" "}
      <div className="podium-block"><span className={`rank-badge ${rank}`}>{i + 1}</span></div>
    </div>
  );
  return (
    <div className="podium">
      {passo(1, "podium-p2", "r2")}
      {" "}
      {passo(0, "podium-p1", "r1")}
      {" "}
      {passo(2, "podium-p3", "r3")}
    </div>
  );
}

// renderCrossCampanha360: #sc-cross-campanha / #cross-campanha-wrap. Independente dos filtros da aba.
export function BlocoCampanha({ todas }: { todas: Linha[] }) {
  const c = useMemo(() => campanha360(todas), [todas]);
  return (
    <SecaoRecolhivel chave="cross-campanha" cabecalho={<SecaoTitulo>Campanha SANTOLIN 360 — 3º trimestre 2026</SecaoTitulo>}>
      <div id="cross-campanha-wrap" style={{ padding: 16 }}>
        <div className="tier-goal-grid">
          {c.metas.map((m, i) => <Fragment key={m.label}>{i > 0 ? " " : null}<MetaDeFases m={m} /></Fragment>)}
        </div>
        {" "}
        <div className="podium-grid">
          {c.podios.map((p, i) => (
            <Fragment key={p.titulo}>
              {i > 0 ? " " : null}
              <div className="podium-col">
                <div className="podium-title">{p.titulo}</div>
                {" "}
                <Podio nomes={p.nomes} />
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
