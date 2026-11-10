"use client";
import { useMemo, useState } from "react";
import { useFiltros } from "@/client/filtros";
import { atribuicoesDoPainel, usePainel } from "@/client/painel";
import { useUsuario } from "@/client/usuario";
import { Kpi } from "@/components/Kpi";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { fmtLabel } from "@/domain/comparativo";
import { fBRL, fN, fPct } from "@/domain/formatos";
import { nomeCurto, paginar } from "@/domain/painel-produtor";
import {
  ROTULO_SITUACAO_RENOV, buscarRenovacoes, dadosRenovacoes, filtrarSituacaoRenov, type FiltroListaRenov, type SituacaoRenov,
} from "@/domain/renovacoes";
import { respDe } from "@/domain/responsavel";
import { AtribuirResponsavel } from "./AtribuirResponsavel";
import s from "./Renovacoes.module.css";

const POR_PAGINA = 50;
const CLASSE_SITUACAO: Record<SituacaoRenov, string> = { renovada: s.renovada, vencida: s.vencida, "em-aberto": s.emAberto };
const ICONE_SITUACAO: Record<SituacaoRenov, string> = { renovada: "✅", vencida: "❌", "em-aberto": "⏳" };
const BOTOES_SITUACAO: { sit: FiltroListaRenov; rotulo: string }[] = [
  { sit: "", rotulo: "Todas" }, { sit: "renovada", rotulo: "Renovadas" }, { sit: "vencida", rotulo: "Vencidas" }, { sit: "em-aberto", rotulo: "Em aberto" },
];
const ATIVO = { borderColor: "#378ADD", fontWeight: 600 } as const;

// Aba Renovações (#tab-renovacoes; o PainelAba já envolve): o que chegou para renovar no período × as renovações
// que entraram nele, e a lista apólice por apólice com a renovação ligada (regras em domain/renovacoes.ts).
export default function Renovacoes() {
  const painel = usePainel();
  const { base } = painel;
  const atrib = atribuicoesDoPainel(painel);
  const { usuario } = useUsuario();
  const gestor = usuario?.role === "gestao" || usuario?.role === "admin";
  const { filtros } = useFiltros();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<FiltroListaRenov>("");
  const [pg, setPg] = useState({ chave: "", n: 1 });
  const d = useMemo(() => dadosRenovacoes(base.linhas, filtros, base.hoje), [base.linhas, filtros, base.hoje]);
  const buscados = useMemo(() => buscarRenovacoes(d.itens, busca), [d.itens, busca]);
  const achados = useMemo(() => filtrarSituacaoRenov(buscados, situacao), [buscados, situacao]);
  // Contagem em cada botão: o que a busca deixou, por situação.
  const contagem = (sit: FiltroListaRenov) => filtrarSituacaoRenov(buscados, sit).length;
  const divergentes = useMemo(() => d.itens.filter((i) => i.divergente).length, [d.itens]);
  const botoes = gestor && divergentes ? [...BOTOES_SITUACAO, { sit: "divergente" as const, rotulo: "Divergentes" }] : BOTOES_SITUACAO;
  // Quem pode receber uma atribuição: os nomes da coluna COLABORADOR da base.
  const colaboradores = useMemo(() => [...new Set(base.linhas.map((r) => r.colab).filter((c) => c.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [base.linhas]);
  // A página volta para 1 quando a busca, a situação ou os filtros mudam.
  const chave = `${busca}|${situacao}|${d.periodo.start}|${d.itens.length}`;
  const pagina = paginar(achados, POR_PAGINA, pg.chave === chave ? pg.n : 1);
  const c = d.cards;
  const sub = (pct: number | null, falta: string) => <>{fPct(pct)} renovado{falta ? ` · faltam ${falta}` : ""}</>;

  return (
    <>
      <div className={s.periodo} id="renov-periodo">
        Vencimentos de {fmtLabel(d.periodo.start)} a {fmtLabel(d.periodo.end)} (vigência dos filtros globais; sem ela, o mês atual).
        Canceladas, Perda Total e Suspensas ficam fora.
      </div>
      {gestor && atrib.erro && (
        <div className={s.aviso} role="status">Não foi possível carregar as atribuições de renovação; os números abaixo seguem a planilha.</div>
      )}
      {gestor && divergentes > 0 && (
        <div className={s.aviso} role="status" id="renov-divergencias">
          <span>{divergentes === 1 ? "1 renovação saiu no nome de outro colaborador." : `${fN(divergentes)} renovações saíram no nome de outro colaborador.`}</span>
          <button type="button" className="btn-sm" onClick={() => setSituacao("divergente")}>Ver divergências</button>
        </div>
      )}
      <SecaoRecolhivel chave="renov-kpis" cabecalho={<SecaoTitulo>Chegaram para renovar × renovações</SecaoTitulo>}>
        <div style={{ padding: 16 }}>
          <div className="kpi-grid" id="renov-kpis">
            <Kpi cor="k-blue" rotulo="Prêmio"
              valor={<>{fBRL(c.renovacoes.premio)}<span style={{ fontSize: 12, fontWeight: 400 }}> de {fBRL(c.chegaram.premio)}</span></>}
              sub={sub(c.pct.premio, c.faltam.premio ? fBRL(c.faltam.premio) : "")} />
            <Kpi cor="k-green" rotulo="Comissão"
              valor={<>{fBRL(c.renovacoes.com)}<span style={{ fontSize: 12, fontWeight: 400 }}> de {fBRL(c.chegaram.com)}</span></>}
              sub={sub(c.pct.com, c.faltam.com ? fBRL(c.faltam.com) : "")} />
            <Kpi cor="k-purple" rotulo="Apólices"
              valor={<>{fN(c.renovacoes.qtd)}<span style={{ fontSize: 12, fontWeight: 400 }}> de {fN(c.chegaram.qtd)}</span></>}
              sub={<>{fPct(c.pct.qtd)} · {fN(c.desfecho.renovadas)} renovadas · {fN(c.desfecho.vencidas)} vencidas · {fN(c.desfecho.emAberto)} em aberto</>} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
            Valor grande: renovações (apólices R) com início de vigência no período. &quot;de&quot;: o que chegou para renovar (apólices N e R com fim de vigência no período).
          </div>
        </div>
      </SecaoRecolhivel>
      {" "}
      <SecaoRecolhivel
        chave="renov-lista"
        cabecalho={<SecaoTitulo>Apólice por apólice{" "}<SecaoBadge id="renov-badge">{fN(achados.length)} apólices</SecaoBadge></SecaoTitulo>}
        controles={
          <>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginRight: 8 }} role="group" aria-label="Filtrar por situação">
              {botoes.map((b) => (
                <button key={b.rotulo} type="button" className="btn-sm" aria-pressed={situacao === b.sit} onClick={() => setSituacao(b.sit)}
                  style={{ fontSize: 11, ...(situacao === b.sit ? ATIVO : {}) }}>{b.rotulo} ({fN(contagem(b.sit))})</button>
              ))}
            </div>
            <input type="search" className={s.busca} aria-label="Buscar renovações" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, CPF/CNPJ, apólice, seguradora, ramo, colaborador…" />
          </>
        }
      >
        <div className={`${s.tabelaWrap} detail-table-wrap`}>
          {achados.length ? (
            <table className="ret-table detail-table" id="renov-tabela">
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Cliente</th>
                  <th>Ramo</th>
                  <th>Seguradora</th>
                  <th>Colaborador</th>
                  <th>Vence</th>
                  <th style={{ textAlign: "right" }}>Prêmio ant.</th>
                  <th style={{ textAlign: "right" }}>Prêmio renov.</th>
                  <th style={{ textAlign: "right" }}>Comissão ant.</th>
                  <th style={{ textAlign: "right" }}>Comissão renov.</th>
                  <th>Situação</th>
                  {gestor && <th>Responsável</th>}
                </tr>
              </thead>
              <tbody>
                {pagina.itens.map(({ antiga: a, renovacao: r, situacao, divergente }, i) => (
                  <tr key={`${a.seg}|${a.apolice}|${i}`}>
                    <td className="name-cell" style={{ maxWidth: 200 }} title={`${a.cli} · apólice ${a.apolice}${r ? ` → ${r.apolice}` : ""}`}>{a.cli}</td>
                    <td>{a.ramo}</td>
                    <td>{a.seg}</td>
                    <td>
                      {nomeCurto(respDe(a))}
                      {a.resp !== undefined && <span className={`${s.selo} ${s.seloAtribuida}`} title={`Na planilha: ${a.colab}`}>atribuída</span>}
                    </td>
                    <td>{fmtLabel(a.fim)}</td>
                    <td className="num">{fBRL(a.premio)}</td>
                    <td className="num">{r ? fBRL(r.premio) : "—"}</td>
                    <td className="num">{fBRL(a.com)}</td>
                    <td className="num">{r ? fBRL(r.com) : "—"}</td>
                    <td>
                      <span className={`${s.selo} ${CLASSE_SITUACAO[situacao]}`}>{ICONE_SITUACAO[situacao]} {ROTULO_SITUACAO_RENOV[situacao]}</span>
                      {divergente && r && (
                        <span className={`${s.selo} ${s.seloDivergente}`} title={`Renovação no nome de ${r.colab}; atribuída a ${respDe(a)}`}>⚠ divergente</span>
                      )}
                    </td>
                    {gestor && (
                      <td><AtribuirResponsavel key={`${a.seg}|${a.apolice}|${a.fim}|${a.resp ?? ""}`} antiga={a} colaboradores={colaboradores} salvar={atrib.salvar} desfazer={atrib.desfazer} /></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              {busca.trim() && situacao ? "Nenhuma apólice encontrada com essa busca e situação."
                : busca.trim() ? "Nenhuma apólice encontrada para essa busca."
                : situacao === "divergente" ? "Nenhuma divergência no período."
                : situacao ? `Nenhuma apólice ${ROTULO_SITUACAO_RENOV[situacao].toLowerCase()} no período.` : "Nenhuma apólice chegou para renovar no período com os filtros atuais."}
            </div>
          )}
        </div>
        {pagina.paginas > 1 && (
          <div className={s.paginacao}>
            <span>{fN((pagina.pagina - 1) * POR_PAGINA + 1)}–{fN((pagina.pagina - 1) * POR_PAGINA + pagina.itens.length)} de {fN(achados.length)}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button type="button" className="btn-sm" disabled={pagina.pagina <= 1} onClick={() => setPg({ chave, n: pagina.pagina - 1 })}>← Anterior</button>
              <span>Página {pagina.pagina} de {pagina.paginas}</span>
              <button type="button" className="btn-sm" disabled={pagina.pagina >= pagina.paginas} onClick={() => setPg({ chave, n: pagina.pagina + 1 })}>Próxima →</button>
            </div>
          </div>
        )}
      </SecaoRecolhivel>
    </>
  );
}
