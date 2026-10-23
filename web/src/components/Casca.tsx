"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBase } from "@/client/useBase";
import { FiltrosProvider, useFiltros } from "@/client/filtros";
import { EstadoAbasProvider } from "@/client/estadoAbas";
import { usePodeReprocessar } from "@/client/podeReprocessar";
import { ContextoPainel, usePainel, type ValorPainel } from "@/client/painel";
import { useUsuario, type Usuario } from "@/client/usuario";
import { AvisoSessao, AvisoSemConexao } from "./AvisoSessao";
import { ABAS } from "./Abas";
import { BarraLateral } from "./BarraLateral";
import { Cabecalho, textoRecBadge } from "./Cabecalho";
import { FiltrosGlobais } from "./FiltrosGlobais";
import { PainelFontes } from "./PainelFontes";
import { ModoTvEfeito } from "./ModoTv";
import { TelaCarregando, TelaErro, textoErroProducao } from "./TelaErro";
import s from "./Casca.module.css";

const ROTAS_ABAS = new Set<string>(ABAS.map((a) => a.id));
/** Rotas com a barra lateral: as abas + as páginas do painel do produtor e do admin. */
const ROTAS_COM_CASCA = new Set<string>([...ROTAS_ABAS, "meu-painel", "produtores", "admin"]);

// Casca do painel: barra lateral + conteúdo. Nas rotas das abas o conteúdo é #dash (cabeçalho e
// filtros globais em volta da aba atual). /exibicao-tv e /apresentacao são telas cheias: recebem
// os mesmos contextos, sem a casca.
export function Casca({ children }: { children: ReactNode }) {
  const { estado, base, erro, recarregar, ultimaBoaEm, semConexaoDesde } = useBase();
  // Depois do useBase: a busca de /api/dados sai primeiro. Não bloqueia o painel enquanto carrega.
  const { usuario, carregando: carregandoUsuario } = useUsuario();
  const [fontesAberto, setFontesAberto] = useState(false);
  const abrirFontes = useCallback(() => setFontesAberto(true), []);
  const fecharFontes = useCallback(() => setFontesAberto(false), []);
  const podeReprocessar = usePodeReprocessar(fontesAberto);
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
          <Painel usuario={usuario} carregandoUsuario={carregandoUsuario}>{children}</Painel>
        </FiltrosProvider>
      </ContextoPainel.Provider>
    );
  }
  return (
    // O estado de UI das abas fica acima das rotas: sobrevive à troca de aba (como o DOM do app antigo).
    <EstadoAbasProvider>
      <ModoTvEfeito />
      {base && estado === "sessao-expirada" && <AvisoSessao desde={ultimaBoaEm} />}
      {base && estado !== "sessao-expirada" && semConexaoDesde !== undefined && <AvisoSemConexao desde={semConexaoDesde} />}
      {conteudo}
      {base && !base.semAcesso && (
        <PainelFontes aberto={fontesAberto} onFechar={fecharFontes} manifesto={base.manifesto} totalLinhas={base.linhas.length}
          avisosSaude={base.avisosSaude} podeReprocessar={podeReprocessar} recarregar={recarregar} />
      )}
    </EstadoAbasProvider>
  );
}

// Escopo "nada" (vendedor sem vínculo) também cai aqui: a casca abre com o Meu painel, que avisa.
function Painel({ children, usuario, carregandoUsuario }: { children: ReactNode; usuario: Usuario | null; carregandoUsuario: boolean }) {
  const { inicial, recBadgeContagem } = useFiltros();
  const rota = usePathname().split("/")[1] ?? "";
  const { base, abrirFontes } = usePainel();
  if (!ROTAS_COM_CASCA.has(rota)) return <>{children}</>;
  return (
    <div className={s.casca}>
      <BarraLateral usuario={usuario} carregando={carregandoUsuario} base={base} />
      {ROTAS_ABAS.has(rota) ? (
        <div id="dash" className={s.conteudo}>
          <Cabecalho base={base} recBadge={textoRecBadge(base, recBadgeContagem, inicial)} onAbrirFontes={abrirFontes} />
          <FiltrosGlobais temProducao={base.linhas.length > 0} />
          {children}
        </div>
      ) : (
        <div className={s.conteudo}>{children}</div>
      )}
    </div>
  );
}

