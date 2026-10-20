"use client";
import { useCallback, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBase } from "@/client/useBase";
import { FiltrosProvider, useFiltros } from "@/client/filtros";
import { ContextoPainel, usePainel, type ValorPainel } from "@/client/painel";
import { ABAS, Abas } from "./Abas";
import { Cabecalho, textoRecBadge } from "./Cabecalho";
import { FiltrosGlobais } from "./FiltrosGlobais";
import { ModoTvEfeito } from "./ModoTv";
import { TelaCarregando, TelaErro, textoErroProducao } from "./TelaErro";

const ROTAS_COM_CASCA = new Set<string>(ABAS.map((a) => a.id));

// Casca do painel (#dash): cabeçalho, abas e filtros globais em volta da aba atual.
// /exibicao-tv e /apresentacao são telas cheias: recebem os mesmos contextos, sem a casca.
export function Casca({ children }: { children: ReactNode }) {
  const { estado, base, erro, recarregar } = useBase();
  // O painel de fontes (PainelFontes) entra na Task 11; até lá o link "N arquivos" não abre nada.
  const abrirFontes = useCallback(() => {}, []);
  const painel = useMemo<ValorPainel | null>(() => (base ? { base, recarregar, abrirFontes } : null), [base, recarregar, abrirFontes]);

  let conteudo: ReactNode;
  if (!base || !painel) {
    if (estado === "sessao-expirada") {
      conteudo = <TelaErro mensagem="Sua sessão expirou. Entre novamente para carregar os dados." acoes={<a className="btn-sm" href="/entrar">Entrar novamente</a>} />;
    } else if (estado === "erro") {
      conteudo = <TelaErro mensagem={`Erro ao carregar os dados: ${erro ?? ""}`} acoes={<button type="button" className="btn-sm" onClick={recarregar}>Tentar novamente</button>} />;
    } else {
      conteudo = <TelaCarregando />;
    }
  } else if (base.erroProducao && base.sinistros.length === 0) {
    // Sem produção e sem sinistros: nada para mostrar além do motivo (sem upload). Com
    // sinistros, o painel abre e as abas de produção mostram o motivo (PainelAba).
    conteudo = (
      <TelaErro
        mensagem={textoErroProducao(base.erroProducao)}
        acoes={<>
          <button type="button" className="btn-sm" onClick={abrirFontes}>Ver fontes</button>
          <button type="button" className="btn-sm" onClick={recarregar}>Tentar novamente</button>
        </>}
      />
    );
  } else {
    conteudo = (
      <ContextoPainel.Provider value={painel}>
        <FiltrosProvider linhas={base.linhas}>
          <Painel>{children}</Painel>
        </FiltrosProvider>
      </ContextoPainel.Provider>
    );
  }
  return <><ModoTvEfeito />{conteudo}</>;
}

function Painel({ children }: { children: ReactNode }) {
  const { inicial, recBadgeContagem } = useFiltros();
  const rota = usePathname().split("/")[1] ?? "";
  const { base, abrirFontes } = usePainel();
  if (!ROTAS_COM_CASCA.has(rota)) return <>{children}</>;
  return (
    <div id="dash">
      <Cabecalho base={base} recBadge={textoRecBadge(base, recBadgeContagem, inicial)} onAbrirFontes={abrirFontes} />
      <Abas />
      <FiltrosGlobais temProducao={base.linhas.length > 0} />
      {children}
    </div>
  );
}

