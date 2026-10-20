"use client";
import type { ReactNode } from "react";
import { usePainel } from "@/client/painel";
import { ABAS_PRODUCAO } from "./Abas";

// .tab-pane#tab-<id>. Sem a fonte da aba, mostra o estado vazio do app antigo
// (showTabNoData) no lugar do conteúdo — e, se a produção falhou, o motivo.
export function PainelAba({ id, children }: { id: string; children: ReactNode }) {
  const { base } = usePainel();
  const semDados = ABAS_PRODUCAO.includes(id) ? base.linhas.length === 0 : id === "sinistros" ? base.sinistros.length === 0 : false;
  return (
    <div className="tab-pane active" id={`tab-${id}`}>
      {semDados ? (
        <>
          {ABAS_PRODUCAO.includes(id) && base.erroProducao && <p className="sp-error">{base.erroProducao.mensagem}</p>}
          <div className="tab-no-data" style={{ display: "flex" }}>
            <p className="tab-no-data-title">Sem fonte de dados</p>
            <p className="tab-no-data-hint">A planilha correspondente não foi encontrada ou ainda não foi carregada no SharePoint.</p>
          </div>
        </>
      ) : children}
    </div>
  );
}
