"use client";
import { useEffect, useState } from "react";
import { fN } from "@/domain/formatos";
import { ATIVA_VENCIDA_FOLGA_DIAS, ATIVA_VENCIDA_LIMITE_AVISO, fontesDesatualizadas, type ManifestoFonte } from "@/domain/producao/base";
import { SAUDE_FILE, SAUDE_MODELO } from "@/domain/saude/modelo";
import "./PainelFontes.css";

// Painel de fontes (openFontesModal, main.js 870–1004): de onde veio cada pedaço da base.
// Responde "faltou algum ano?" e "o ano corrente está atualizado?" e denuncia sobreposição.

/** baixarModeloSaude: o xlsx só é carregado no clique, fora do bundle inicial. */
export async function baixarModeloSaude(): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([SAUDE_MODELO]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Saúde");
  XLSX.writeFile(wb, SAUDE_FILE);
}

function textoAnos(a: ManifestoFonte["anos"]): string {
  if (!a) return "—";
  return a.min === a.max ? String(a.min) : `${a.min}–${a.max}`;
}

export function PainelFontes({
  aberto, onFechar, manifesto, totalLinhas, avisosSaude, podeReprocessar, recarregar,
}: {
  aberto: boolean;
  onFechar(): void;
  manifesto: ManifestoFonte[];
  totalLinhas: number;
  avisosSaude: string[];
  podeReprocessar: boolean;
  recarregar(): void;
}) {
  const [reprocessando, setReprocessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const totalDup = manifesto.reduce((a, s) => a + s.duplicadas, 0);
  const desatualizadas = fontesDesatualizadas(manifesto);

  async function reprocessar() {
    setReprocessando(true);
    setErro(null);
    try {
      const r = await fetch("/api/fontes/reprocessar", { method: "POST", credentials: "same-origin" });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = (await r.json()) as { erro?: string }; if (j.erro) msg = j.erro; } catch { /* corpo não é JSON */ }
        throw new Error(msg);
      }
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setReprocessando(false);
    }
  }

  return (
    <div className="export-modal-overlay" id="fontes-modal" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="export-modal-card fontes-card" role="dialog" aria-label="Fontes de produção">
        <div className="export-modal-title">Fontes de produção</div>
        <div id="fontes-modal-body">
          <table className="fontes-table">
            <thead>
              <tr>
                <th>Arquivo</th><th className="num">Linhas</th><th>Anos</th><th>Atualizado</th><th className="num">Duplicadas</th>
                <th className="num" title={`Apólices com situação Ativa e término de vigência vencido há mais de ${ATIVA_VENCIDA_FOLGA_DIAS} dias`}>Ativas vencidas</th>
              </tr>
            </thead>
            <tbody>
              {manifesto.map((s) => (
                <tr key={s.nome}>
                  <td>
                    {s.nome}
                    {s.saude && (
                      <>
                        <small>
                          {`${fN(s.saude.vinculadas)} vinculadas à produção · ${fN(s.saude.criadas)} criadas${s.saude.avisos.length ? ` · ${fN(s.saude.avisos.length)} aviso(s)` : ""}`}
                        </small>
                      </>
                    )}
                    {s.anosIgnorados.map((i) => (
                      <small key={`i${i.ano}`} className="fontes-cobertura">{`${s.nome}: ${i.ano} ignorado, coberto por ${i.cobertoPor}`}</small>
                    ))}
                    {s.sobreposicoes.map((o) => (
                      <small key={`o${o.ano}-${o.com}`} className="fontes-cobertura">{`sobreposição em ${o.ano} com ${o.com} (${fN(o.linhas)} linhas)`}</small>
                    ))}
                  </td>
                  <td className="num">{fN(s.total)}</td>
                  <td>{textoAnos(s.anos)}</td>
                  <td>{s.modificadoEm ? new Date(s.modificadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="num">{s.duplicadas ? fN(s.duplicadas) : "—"}</td>
                  <td className={`num${s.ativasVencidas >= ATIVA_VENCIDA_LIMITE_AVISO ? " fontes-destaque" : ""}`}>
                    {s.ativasVencidas >= ATIVA_VENCIDA_LIMITE_AVISO ? "⚠️ " + fN(s.ativasVencidas) : s.ativasVencidas ? fN(s.ativasVencidas) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total em memória</td><td className="num">{fN(totalLinhas)}</td><td colSpan={2} /><td className="num">{totalDup ? fN(totalDup) : "—"}</td><td /></tr>
            </tfoot>
          </table>
          {avisosSaude.length > 0 && (
            <ul className="fontes-avisos" id="fontes-avisos-saude">
              {avisosSaude.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          {desatualizadas.length > 0 && (
            <p className="fontes-warn">
              <strong>{desatualizadas.map((s) => s.nome).join(", ")}</strong>{" "}
              {desatualizadas.length === 1 ? "parece desatualizado" : "parecem desatualizados"}:{" "}
              {desatualizadas.length === 1 ? "tem" : "têm"} apólices marcadas como Ativa com a vigência já terminada. A situação fica congelada no dia da exportação —
              renovações e cancelamentos posteriores não aparecem, e o contrato renovado conta duas vezes. Reexporte o arquivo do ERP e substitua no SharePoint.
            </p>
          )}
          {totalDup > 0 && (
            <p className="fontes-warn">Há linhas repetidas entre arquivos — elas foram descartadas, mas confira se dois arquivos cobrem o mesmo período.</p>
          )}
          <p className="fontes-hint">
            A pasta <strong>Dashboard</strong> no SharePoint aceita um arquivo por ano
            (<code>producao_2021.xlsx</code>, <code>producao_2022.xlsx</code>, …). Basta soltar um arquivo novo lá.
          </p>
          <p className="fontes-hint">
            Os seguros saúde, cujo prêmio e comissão o ERP não lança, vêm de <code>{SAUDE_FILE}</code> na mesma pasta: uma linha por contrato,
            vinculada pela apólice (ou pelo CPF/CNPJ + vigência, quando ainda não há número).
          </p>
          <button type="button" className="export-modal-option" onClick={() => void baixarModeloSaude()}>&#8681; Baixar modelo da planilha de saúde</button>
        </div>
        {podeReprocessar && (
          <button type="button" className="export-modal-option" disabled={reprocessando} onClick={() => void reprocessar()}>
            {reprocessando ? "Reprocessando…" : "↻ Reprocessar fontes"}
          </button>
        )}
        {erro && <p className="fontes-erro" role="alert">{`Falha ao reprocessar: ${erro}`}</p>}
        <button type="button" className="export-modal-cancel" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}
