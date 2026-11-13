"use client";
import { useMemo, useState } from "react";
import { useFiltros } from "@/client/filtros";
import { atribuicoesDoPainel, usePainel, vinculosDoPainel } from "@/client/painel";
import { useUsuario } from "@/client/usuario";
import { Kpi } from "@/components/Kpi";
import { SecaoBadge, SecaoRecolhivel, SecaoTitulo } from "@/components/SecaoRecolhivel";
import { fmtLabel } from "@/domain/comparativo";
import { fBRL, fN, fPct } from "@/domain/formatos";
import { nomeCurto, paginar } from "@/domain/painel-produtor";
import {
  ROTULO_SITUACAO_RENOV, buscarOutrosVencimentos, buscarRenovacoes, dadosRenovacoes, filtrarSituacaoRenov, type FiltroListaRenov, type SituacaoRenov,
} from "@/domain/renovacoes";
import { chaveAtribuicao } from "@/domain/atribuicoes";
import { respDe } from "@/domain/responsavel";
import { AtribuirEmLote } from "./AtribuirEmLote";
import { AtribuirResponsavel } from "./AtribuirResponsavel";
import { VincularRenovacao } from "./VincularRenovacao";
import type { Linha } from "@/domain/tipos";
import type { VinculoRenovacao } from "@/domain/vinculos-renovacao";
import s from "./Renovacoes.module.css";

const POR_PAGINA = 50;
const CLASSE_SITUACAO: Record<SituacaoRenov, string> = { renovada: s.renovada, vencida: s.vencida, "em-aberto": s.emAberto };
const ICONE_SITUACAO: Record<SituacaoRenov, string> = { renovada: "✅", vencida: "❌", "em-aberto": "⏳" };
/** Filtro da lista; 'outros' troca a lista pelas renovações de outros vencimentos. */
type FiltroTela = FiltroListaRenov | "outros";
const BOTOES_SITUACAO: { sit: FiltroTela; rotulo: string }[] = [
  { sit: "", rotulo: "Todas" }, { sit: "renovada", rotulo: "Renovadas" }, { sit: "vencida", rotulo: "Vencidas" }, { sit: "em-aberto", rotulo: "Em aberto" },
];
const ATIVO = { borderColor: "#378ADD", fontWeight: 600 } as const;

// Aba Renovações (#tab-renovacoes; o PainelAba já envolve): o que chegou para renovar no período × as renovações
// que entraram nele, e a lista apólice por apólice com a renovação ligada (regras em domain/renovacoes.ts).
export default function Renovacoes() {
  const painel = usePainel();
  const { base } = painel;
  const atrib = atribuicoesDoPainel(painel);
  const vinc = vinculosDoPainel(painel);
  const { usuario } = useUsuario();
  const gestor = usuario?.role === "gestao" || usuario?.role === "admin";
  const { filtros } = useFiltros();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<FiltroTela>("");
  const outrosAtivo = situacao === "outros";
  const [pg, setPg] = useState({ chave: "", n: 1 });
  // Seleção para a atribuição em lote (chave da vigência). Só conta o que está na lista filtrada.
  const [sel, setSel] = useState<ReadonlySet<string>>(() => new Set());
  const [resultadoLote, setResultadoLote] = useState("");
  // Vínculo manual (spec 2026-11-13): diálogo aberto (A: a partir da antiga; B: a partir da R) e o aviso dos desfeitos.
  const [vinculando, setVinculando] = useState<{ modo: "antiga" | "renovacao"; origem: Linha } | null>(null);
  const [desfeitos, setDesfeitos] = useState<{ apolice: string; outros: boolean }[]>([]);
  const [erroVinculo, setErroVinculo] = useState("");
  const d = useMemo(() => dadosRenovacoes(base.linhas, filtros, base.hoje, vinc.vinculos), [base.linhas, filtros, base.hoje, vinc.vinculos]);
  const clientePorApolice = useMemo(() => new Map(base.linhas.map((r) => [`${r.seg}|${r.apolice}`, r.cli] as const)), [base.linhas]);
  const clienteDe = (seg: string, apolice: string) => clientePorApolice.get(`${seg}|${apolice}`) ?? "outro cliente";
  const abrirVinculo = (modo: "antiga" | "renovacao", origem: Linha) => { setDesfeitos([]); setErroVinculo(""); setVinculando({ modo, origem }); };
  // Quem perdeu o vínculo: a outra antiga (fica sem renovação, na lista) ou a outra R (volta para outros vencimentos).
  const concluirVinculo = (lista: VinculoRenovacao[]) => {
    const o = vinculando!.origem, antiga = vinculando!.modo === "antiga" ? o : null;
    setVinculando(null);
    setDesfeitos(lista.map((x) => {
      const mesmaAntiga = antiga ? x.seg === antiga.seg && x.apolice === antiga.apolice && x.fim === antiga.fim
        : !(x.renSeg === o.seg && x.renApolice === o.apolice && x.renVig === o.vig);
      return mesmaAntiga ? { apolice: x.renApolice, outros: true } : { apolice: x.apolice, outros: false };
    }));
  };
  const irPara = (x: { apolice: string; outros: boolean }) => { setBusca(x.apolice); setSituacao(x.outros ? "outros" : ""); };
  const desfazerVinculo = async (a: Linha) => {
    setErroVinculo("");
    try { await vinc.desfazer({ seg: a.seg, apolice: a.apolice, fim: a.fim }); } catch (e) { setErroVinculo(e instanceof Error ? e.message : "Não foi possível desfazer o vínculo."); }
  };
  const buscados = useMemo(() => buscarRenovacoes(d.itens, busca), [d.itens, busca]);
  const achados = useMemo(() => (outrosAtivo ? [] : filtrarSituacaoRenov(buscados, situacao as FiltroListaRenov)), [buscados, situacao, outrosAtivo]);
  const outrosAchados = useMemo(() => buscarOutrosVencimentos(d.outros, busca), [d.outros, busca]);
  // Contagem em cada botão: o que a busca deixou, por situação.
  const contagem = (sit: FiltroTela) => (sit === "outros" ? outrosAchados.length : filtrarSituacaoRenov(buscados, sit).length);
  const divergentes = useMemo(() => d.itens.filter((i) => i.divergente).length, [d.itens]);
  const botoes: { sit: FiltroTela; rotulo: string }[] = [
    ...BOTOES_SITUACAO,
    ...(gestor && divergentes ? [{ sit: "divergente" as const, rotulo: "Divergentes" }] : []),
    ...(d.outros.length ? [{ sit: "outros" as const, rotulo: "Outros vencimentos" }] : []),
  ];
  // Quem pode receber uma atribuição: os nomes da coluna COLABORADOR da base.
  const colaboradores = useMemo(() => [...new Set(base.linhas.map((r) => r.colab).filter((c) => c.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [base.linhas]);
  // A página volta para 1 quando a busca, a situação ou os filtros mudam.
  const chave = `${busca}|${situacao}|${d.periodo.start}|${d.itens.length}`;
  const pagina = paginar(achados, POR_PAGINA, pg.chave === chave ? pg.n : 1);
  const paginaOutros = paginar(outrosAchados, POR_PAGINA, pg.chave === chave ? pg.n : 1);
  const pag = outrosAtivo ? paginaOutros : pagina;
  const totalLista = outrosAtivo ? outrosAchados.length : achados.length;
  const selecionadas = gestor && !outrosAtivo ? achados.filter((i) => sel.has(chaveAtribuicao(i.antiga))) : [];
  const chavesPagina = pagina.itens.map((i) => chaveAtribuicao(i.antiga));
  const paginaToda = chavesPagina.length > 0 && chavesPagina.every((k) => sel.has(k));
  const alternar = (ks: string[], marcar: boolean) => {
    setResultadoLote("");
    setSel((v) => { const n = new Set(v); for (const k of ks) { if (marcar) n.add(k); else n.delete(k); } return n; });
  };
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
            Valor grande: o que renovou do que chegou (prêmio e comissão das renovações ligadas; em apólices, as renovadas).
            &quot;de&quot;: o que chegou para renovar (apólices N e R com fim de vigência no período).
          </div>
          {c.outros.qtd > 0 && (
            <div className={s.outros} id="renov-outros">
              <span>
                +{fN(c.outros.qtd)} {c.outros.qtd === 1 ? "renovação" : "renovações"} de outros vencimentos ({fBRL(c.outros.premio)} de prêmio,{" "}
                {fBRL(c.outros.com)} de comissão) fora da conta.
              </span>{" "}
              <button type="button" className="btn-sm" aria-label="Ver renovações de outros vencimentos" onClick={() => setSituacao("outros")}>Ver</button>
            </div>
          )}
        </div>
      </SecaoRecolhivel>
      {" "}
      <SecaoRecolhivel
        chave="renov-lista"
        cabecalho={<SecaoTitulo>Apólice por apólice{" "}<SecaoBadge id="renov-badge">{fN(totalLista)} {outrosAtivo ? "renovações" : "apólices"}</SecaoBadge></SecaoTitulo>}
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
        {vinculando && (
          <VincularRenovacao key={`${vinculando.modo}|${vinculando.origem.seg}|${vinculando.origem.apolice}|${vinculando.origem.vig}`}
            modo={vinculando.modo} origem={vinculando.origem}
            livres={vinculando.modo === "antiga" ? d.livres.renovacoes : d.livres.antigas}
            vincular={vinc.vincular} clienteDe={clienteDe} concluir={concluirVinculo} fechar={() => setVinculando(null)} />
        )}
        {desfeitos.length > 0 && (
          <div className={s.resultadoLote} role="status" aria-label="Vínculos desfeitos">
            {desfeitos.map((x) => (
              <div key={x.apolice}>Vínculo desfeito na apólice{" "}
                <button type="button" className={s.link} onClick={() => irPara(x)}>{x.apolice}</button></div>
            ))}
          </div>
        )}
        {erroVinculo && <div className={s.aviso} role="alert">{erroVinculo}</div>}
        {resultadoLote && <div className={s.resultadoLote} role="status" aria-label="Resultado da atribuição em lote">{resultadoLote}</div>}
        {selecionadas.length > 0 && (
          <AtribuirEmLote antigas={selecionadas.map((i) => i.antiga)} totalLista={achados.length} colaboradores={colaboradores} salvarLote={atrib.salvarLote}
            selecionarTodas={() => alternar(achados.map((i) => chaveAtribuicao(i.antiga)), true)}
            limpar={() => alternar([...sel], false)}
            concluir={(m) => { setSel(new Set()); setResultadoLote(m); }} />
        )}
        <div className={`${s.tabelaWrap} detail-table-wrap`}>
          {outrosAtivo ? (outrosAchados.length ? (
            <table className="ret-table detail-table" id="renov-outros-tabela">
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Cliente</th>
                  <th>Ramo</th>
                  <th>Seguradora</th>
                  <th>Colaborador</th>
                  <th>Início</th>
                  <th style={{ textAlign: "right" }}>Prêmio ant.</th>
                  <th style={{ textAlign: "right" }}>Prêmio renov.</th>
                  <th style={{ textAlign: "right" }}>Comissão ant.</th>
                  <th style={{ textAlign: "right" }}>Comissão renov.</th>
                  <th>Apólice anterior</th>
                  {gestor && <th>Vínculo</th>}
                </tr>
              </thead>
              <tbody>
                {paginaOutros.itens.map(({ renovacao: r, antiga: a }, i) => (
                  <tr key={`${r.seg}|${r.apolice}|${i}`}>
                    <td className="name-cell" style={{ maxWidth: 200 }} title={`${r.cli} · apólice ${r.apolice}${a ? ` (anterior ${a.apolice})` : ""}`}>{r.cli}</td>
                    <td>{r.ramo}</td>
                    <td>{r.seg}</td>
                    <td>{nomeCurto(respDe(r))}</td>
                    <td>{fmtLabel(r.vig)}</td>
                    <td className="num">{a ? fBRL(a.premio) : "—"}</td>
                    <td className="num">{fBRL(r.premio)}</td>
                    <td className="num">{a ? fBRL(a.com) : "—"}</td>
                    <td className="num">{fBRL(r.com)}</td>
                    <td>{a ? `Venceu em ${fmtLabel(a.fim)}` : "Sem apólice anterior ligada"}</td>
                    {gestor && (
                      <td>{!a && <button type="button" className="btn-sm" style={{ fontSize: 10 }} onClick={() => abrirVinculo("renovacao", r)}>Vincular à apólice anterior</button>}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              {busca.trim() ? "Nenhuma renovação de outro vencimento para essa busca." : "Nenhuma renovação de outro vencimento no período."}
            </div>
          )) : achados.length ? (
            <table className="ret-table detail-table" id="renov-tabela">
              <thead>
                <tr>
                  {gestor && (
                    <th className={s.colSel}>
                      <input type="checkbox" aria-label="Selecionar todas desta página" checked={paginaToda} onChange={() => alternar(chavesPagina, !paginaToda)} />
                    </th>
                  )}
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
                {pagina.itens.map(({ antiga: a, renovacao: r, situacao, divergente, manual }, i) => (
                  <tr key={`${a.seg}|${a.apolice}|${i}`}>
                    {gestor && (
                      <td className={s.colSel}>
                        <input type="checkbox" aria-label={`Selecionar ${a.cli} (apólice ${a.apolice})`} checked={sel.has(chaveAtribuicao(a))}
                          onChange={(e) => alternar([chaveAtribuicao(a)], e.target.checked)} />
                      </td>
                    )}
                    <td className="name-cell" style={{ maxWidth: 200 }} title={`${a.cli} · apólice ${a.apolice}${r ? ` → ${r.apolice}` : ""}`}>
                      {a.cli}
                      {r && r.cli !== a.cli && <><br /><span className={`${s.selo} ${s.seloRenovadaComo}`}>renovada como {r.cli}</span></>}
                    </td>
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
                      {gestor && !r && (
                        <button type="button" className="btn-sm" style={{ fontSize: 10, marginLeft: 4 }} onClick={() => abrirVinculo("antiga", a)}>Vincular renovação</button>
                      )}
                      {gestor && manual && (
                        <button type="button" className="btn-sm" style={{ fontSize: 10, marginLeft: 4 }} onClick={() => desfazerVinculo(a)}>Desfazer vínculo</button>
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
                : situacao ? `Nenhuma apólice ${ROTULO_SITUACAO_RENOV[situacao as SituacaoRenov].toLowerCase()} no período.` : "Nenhuma apólice chegou para renovar no período com os filtros atuais."}
            </div>
          )}
        </div>
        {pag.paginas > 1 && (
          <div className={s.paginacao}>
            <span>{fN((pag.pagina - 1) * POR_PAGINA + 1)}–{fN((pag.pagina - 1) * POR_PAGINA + pag.itens.length)} de {fN(totalLista)}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button type="button" className="btn-sm" disabled={pag.pagina <= 1} onClick={() => setPg({ chave, n: pag.pagina - 1 })}>← Anterior</button>
              <span>Página {pag.pagina} de {pag.paginas}</span>
              <button type="button" className="btn-sm" disabled={pag.pagina >= pag.paginas} onClick={() => setPg({ chave, n: pag.pagina + 1 })}>Próxima →</button>
            </div>
          </div>
        )}
      </SecaoRecolhivel>
    </>
  );
}
