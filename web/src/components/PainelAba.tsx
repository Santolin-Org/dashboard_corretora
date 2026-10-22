"use client";
import type { ReactNode } from "react";
import { usePainel } from "@/client/painel";
import { ABAS_PRODUCAO } from "./Abas";
import { ErroProducao } from "./TelaErro";

// .tab-pane#tab-<id>. Sem a fonte da aba, mostra o estado vazio do app antigo
// (showTabNoData) no lugar do conteúdo. Se a produção falhou (erroProducao), as abas de
// produção mostram o motivo no lugar do conteúdo; Sinistros segue funcionando.
export function PainelAba({ id, children }: { id: string; children: ReactNode }) {
  const { base } = usePainel();
  const deProducao = ABAS_PRODUCAO.includes(id);
  if (deProducao && base.erroProducao) {
    return <div className="tab-pane active" id={`tab-${id}`}><ErroProducao erro={base.erroProducao} /></div>;
  }
  const semDados = deProducao ? base.linhas.length === 0 : id === "sinistros" ? base.sinistros.length === 0 : false;
  return (
    <div className="tab-pane active" id={`tab-${id}`}>
      {semDados ? (
        <>
          <div className="tab-no-data" style={{ display: "flex" }}>
            <p className="tab-no-data-title">Sem fonte de dados</p>
            <p className="tab-no-data-hint">A planilha correspondente não foi encontrada ou ainda não foi carregada no SharePoint.</p>
          </div>
        </>
      ) : children}
    </div>
  );
}
