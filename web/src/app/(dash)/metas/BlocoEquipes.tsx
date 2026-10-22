"use client";
import { fBRL, fP } from "@/domain/formatos";
import type { CardEquipe, CardsEquipe } from "@/domain/metas";

// renderMetasEquipeCards: #metas-equipe-cards (Pessoais, Patrimoniais, Geral) e #metas-excluidos-note. O espaço
// antes de cada bloco reproduz a quebra de linha do template antigo (os cartões saem colados, sem espaço entre eles).
function Cartao({ cls, rotulo, c }: { cls: string; rotulo: string; c: CardEquipe }) {
  const sp = " ";
  return (
    <div className={`meta-team-card ${cls}`}>
      {sp}
      <div className="meta-team-head">
        {sp}
        <span className="meta-team-name">{rotulo}</span>
        {sp}
        {c.ramos.length ? <span className="meta-card-ramos" title={c.ramos.join(", ")}>{c.ramos.length} ramo{c.ramos.length > 1 ? "s" : ""}</span> : null}
        {sp}
      </div>
      {sp}
      <div className="meta-team-rows">
        {sp}
        <div className="mt-row mt-row-meta"><span className="mt-lbl">Meta Prêmio</span><span className="mt-val">{fBRL(c.metaProd)}</span></div>
        {sp}
        <div className="mt-row mt-row-meta"><span className="mt-lbl">Meta Comissão</span><span className="mt-val">{fBRL(c.metaCom)}</span></div>
        {sp}
        <div className="mt-divider" />
        {sp}
        <div className="mt-row mt-row-base"><span className="mt-lbl">Base Prêmio</span><span className="mt-val">{fBRL(c.baseProd)}</span></div>
        {sp}
        <div className="mt-row mt-row-base"><span className="mt-lbl">Base Comissão</span><span className="mt-val">{fBRL(c.baseCom)}</span></div>
        {sp}
        <div className="mt-row mt-row-base"><span className="mt-lbl">% Comissão</span><span className="mt-val">{fP(c.pctMetaCom)}</span></div>
        {sp}
      </div>
      {sp}
    </div>
  );
}

export function BlocoEquipes({ cards, aoExportar }: { cards: CardsEquipe | null; aoExportar(): void }) {
  return (
    <div className="metas-team-section">
      <div className="metas-team-header">
        <span className="metas-team-title">Metas por equipe</span>
        {" "}
        <button type="button" className="btn-sm" style={{ fontSize: 10, padding: "2px 6px" }} onClick={aoExportar}>Exportar</button>
      </div>
      {" "}
      <div className="metas-team-grid" id="metas-equipe-cards">
        {cards ? (
          <>
            <Cartao cls="mt-pessoais" rotulo="Pessoais" c={cards.pessoais} />
            <Cartao cls="mt-patrimoniais" rotulo="Patrimoniais" c={cards.patrimoniais} />
            <Cartao cls="mt-geral" rotulo="Geral" c={cards.geral} />
          </>
        ) : null}
      </div>
      {" "}
      <div className="metas-excluidos-note" id="metas-excluidos-note">
        {cards ? (cards.excluded.length
          ? <><strong>Fora da contagem da meta</strong> ({cards.excluded.length}): {cards.excluded.join(" · ")}</>
          : "Nenhum ramo fora da meta no período base.") : null}
      </div>
    </div>
  );
}
