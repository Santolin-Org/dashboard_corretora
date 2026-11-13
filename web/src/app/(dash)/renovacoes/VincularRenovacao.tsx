"use client";
import { useMemo, useState } from "react";
import type { Linha } from "@/domain/tipos";
import { fmtLabel } from "@/domain/comparativo";
import { fBRL } from "@/domain/formatos";
import { sugestoesAntiga, sugestoesRenovacao, type VinculoRenovacao } from "@/domain/vinculos-renovacao";
import type { NovoVinculo, ResultadoVinculo } from "@/client/vinculos-renovacao";
import s from "./Renovacoes.module.css";

const MAX_SUGESTOES = 20;

/** Texto do alerta de conflito: para cada vínculo existente, quem já está vinculado a quê (cliente e apólice do outro
 *  lado). Conflito na antiga = ela já tem outra R; senão a R já é de outra antiga. */
export function textoConflitos(v: NovoVinculo, conflitos: VinculoRenovacao[], clienteDe: (seg: string, apolice: string) => string): string {
  const linhas = conflitos.map((c) =>
    c.seg === v.seg && c.apolice === v.apolice && c.fim === v.fim
      ? `Esta apólice já está vinculada a ${clienteDe(c.renSeg, c.renApolice)} (apólice ${c.renApolice}).`
      : `Esta renovação já está vinculada a ${clienteDe(c.seg, c.apolice)} (apólice ${c.apolice}).`);
  return [...linhas, "Desfazer esse vínculo e vincular a esta?"].join("\n");
}

// Diálogo do vínculo manual (só gestão/admin). Modo "antiga" (A): parte da apólice que venceu e procura a renovação
// entre as R livres. Modo "renovacao" (B): parte da R solta e procura a apólice anterior entre as antigas livres.
export function VincularRenovacao({ modo, origem, livres, vincular, clienteDe, concluir, fechar }: {
  modo: "antiga" | "renovacao"; origem: Linha; livres: Linha[];
  vincular(v: NovoVinculo, substituir?: boolean): Promise<ResultadoVinculo>;
  clienteDe(seg: string, apolice: string): string;
  concluir(desfeitos: VinculoRenovacao[]): void; fechar(): void;
}) {
  const [termo, setTermo] = useState("");
  const [escolha, setEscolha] = useState<Linha | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const deAntiga = modo === "antiga";
  const opcoes = useMemo(
    () => (deAntiga ? sugestoesRenovacao(origem, livres, termo) : sugestoesAntiga(origem, livres, termo)).slice(0, MAX_SUGESTOES),
    [deAntiga, origem, livres, termo],
  );
  const titulo = deAntiga ? "Vincular renovação" : "Vincular à apólice anterior";

  const gravar = async () => {
    if (!escolha) return;
    const a = deAntiga ? origem : escolha, r = deAntiga ? escolha : origem;
    const v: NovoVinculo = { seg: a.seg, apolice: a.apolice, fim: a.fim, renSeg: r.seg, renApolice: r.apolice, renVig: r.vig };
    setOcupado(true); setErro("");
    try {
      let res = await vincular(v);
      if (!res.ok) {
        const ok = window.confirm(textoConflitos(v, res.conflitos, clienteDe));
        if (!ok) return;
        res = await vincular(v, true);
        if (!res.ok) throw new Error("O vínculo mudou enquanto você confirmava. Tente de novo.");
      }
      concluir(res.desfeitos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o vínculo.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className={s.vincular} role="dialog" aria-label={titulo}>
      <b>{deAntiga ? `Qual apólice renovou a de ${origem.cli}?` : `De qual apólice esta é a renovação (${origem.cli}, apólice ${origem.apolice})?`}</b>
      <input type="search" aria-label="Buscar no vínculo" value={termo} onChange={(e) => setTermo(e.target.value)} disabled={ocupado}
        placeholder="Buscar por nome, CPF/CNPJ ou nº da apólice" />
      {opcoes.length ? (
        <div role="radiogroup" aria-label="Sugestões" className={s.sugestoes}>
          {opcoes.map((x) => (
            <label key={`${x.seg}|${x.apolice}|${x.vig}`} className={s.sugestao}>
              <input type="radio" name="vinculo" checked={escolha === x} onChange={() => setEscolha(x)} disabled={ocupado} />
              {" "}{x.cli} · {x.seg} · {x.ramo} · apólice {x.apolice} · {deAntiga ? `início ${fmtLabel(x.vig)}` : `venceu ${fmtLabel(x.fim)}`} · {fBRL(x.premio)}
            </label>
          ))}
        </div>
      ) : (
        <div className={s.semSugestao}>
          {deAntiga ? "Nenhuma renovação sem apólice anterior até 90 dias depois do vencimento." : "Nenhuma apólice sem renovação que combine com esta."}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button type="button" className="btn-sm" disabled={ocupado || !escolha} onClick={gravar}>Vincular</button>
        <button type="button" className="btn-sm" disabled={ocupado} onClick={fechar}>Cancelar</button>
        {erro && <span role="alert" className={s.erroAtribuir}>{erro}</span>}
      </div>
    </div>
  );
}
