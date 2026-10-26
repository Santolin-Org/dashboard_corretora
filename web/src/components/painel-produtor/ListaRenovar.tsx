"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePainel } from "@/client/painel";
import {
  aRenovar, CORES_FAIXA, mesAnterior, mesDe, mesSeguinte, nomeCurto, nomeMes, paginar, textoPrazo, type ItemRenovar,
} from "@/domain/painel-produtor";
import s from "./PainelProdutor.module.css";

const CHAVE_MIN = "painelProdutor:vencidasMin";
const lerMin = (): boolean => { try { return localStorage.getItem(CHAVE_MIN) === "1"; } catch { return false; } };
const gravarMin = (v: boolean) => { try { localStorage.setItem(CHAVE_MIN, v ? "1" : "0"); } catch { /* sem storage: só nesta sessão */ } };
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const LEGENDA: [string, string][] = [
  [CORES_FAIXA["1"], "1 dia"], [CORES_FAIXA["3"], "3 dias"], [CORES_FAIXA["7"], "7 dias"], [CORES_FAIXA["15"], "15 dias"],
  [CORES_FAIXA["30"], "30 dias"], [CORES_FAIXA.neutra, "mais de 30"], [CORES_FAIXA.vencida, "vencida"],
];

/** Sem medição (jsdom, tela estreita com a lista empilhada) a página tem 5 itens. */
const POR_PAGINA_PADRAO = 5;
const GAP_ITENS = 6;

/** Quantos itens cabem na altura da lista: mede o contêiner e o primeiro item a cada redimensionamento. */
function useItensQueCabem(ref: RefObject<HTMLUListElement | null>): number {
  const [n, setN] = useState(POR_PAGINA_PADRAO);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const li = el.querySelector("li");
      if (!li || el.clientHeight === 0) return;
      // Só quando a lista tem altura própria (layout de tela cheia); empilhada ela cresce com o conteúdo.
      if (getComputedStyle(el).flexGrow === "0") return;
      setN(Math.max(1, Math.floor((el.clientHeight + GAP_ITENS) / (li.offsetHeight + GAP_ITENS))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return n;
}

function SeletorMes({ mes, atual, aoMudar }: { mes: string; atual: string; aoMudar(m: string): void }) {
  return (
    <div className={s.seletor}>
      <button type="button" aria-label="Mês anterior" onClick={() => aoMudar(mesAnterior(mes))}>‹</button>
      <strong>{nomeMes(mes, "ano")}</strong>
      {mes === atual && <em>atual</em>}
      <button type="button" aria-label="Próximo mês" onClick={() => aoMudar(mesSeguinte(mes))}>›</button>
    </div>
  );
}

/** 4.2 — apólices N/R com fim de vigência no mês escolhido (abre no mês de hoje), paginadas na altura do cartão. */
export function ListaRenovar({ nomes, mostrarDono }: { nomes: ReadonlySet<string>; mostrarDono: boolean }) {
  const { base } = usePainel();
  const atual = mesDe(base.hoje);
  const [mes, setMesBruto] = useState(atual);
  const [pagina, setPagina] = useState(1);
  const [min, setMin] = useState(lerMin);
  const [completa, setCompleta] = useState(false);
  const ulRef = useRef<HTMLUListElement>(null);
  const porPagina = useItensQueCabem(ulRef);
  const { vencidas, aVencer } = useMemo(() => aRenovar(base.linhas, nomes, mes, base.hoje), [base, nomes, mes]);
  const n = vencidas.length + aVencer.length;
  const visiveis = useMemo(() => [...(min ? [] : vencidas), ...aVencer], [min, vencidas, aVencer]);
  const pg = paginar(visiveis, porPagina, pagina);
  const setMes = (m: string) => { setMesBruto(m); setPagina(1); };
  const alternar = () => { setMin(!min); gravarMin(!min); setPagina(1); };

  const item = (i: ItemRenovar, k: number) => (
    <li key={`${i.apolice}|${i.fim}|${k}`} className={s.item}>
      <i style={{ background: CORES_FAIXA[i.faixa] }} />
      <div>
        <b>{i.cli}</b>
        <small>{[i.ramo, i.seg, `fim ${dataBR(i.fim)}`, ...(mostrarDono ? [nomeCurto(i.colab)] : [])].filter(Boolean).join(" · ")}</small>
      </div>
      <span className={`${s.chip} ${s[`k-${i.faixa}`]}`}>{textoPrazo(i.dias)}</span>
    </li>
  );

  return (
    <section className={`${s.card} ${s.cardLista}`} aria-labelledby="pp-renovar-titulo">
      <div className={s.cabeca}>
        <div>
          <h2 id="pp-renovar-titulo">A renovar <small>· {n} em {nomeMes(mes)}</small></h2>
          <div className={s.sub}>Novas e renovações com fim de vigência no mês, ainda não renovadas no Quiver</div>
        </div>
        <SeletorMes mes={mes} atual={atual} aoMudar={setMes} />
      </div>
      {n === 0 && <p className={s.vazio}>Nenhuma apólice a renovar em {nomeMes(mes, "ano")}.</p>}
      {vencidas.length > 0 && (
        <button type="button" className={s.grupo} aria-expanded={!min} onClick={alternar}>
          <span>{min ? "▸" : "▾"} Vencidas em {nomeMes(mes)} sem renovação · {vencidas.length}</span>
          <u>{min ? "mostrar" : "minimizar"}</u>
        </button>
      )}
      <ul ref={ulRef} className={s.lista}>{pg.itens.map(item)}</ul>
      {n > 0 && (
        <div className={s.rodapeLista}>
          {pg.paginas > 1 ? (
            <div className={s.paginacao}>
              <button type="button" aria-label="Página anterior" disabled={pg.pagina === 1} onClick={() => setPagina(pg.pagina - 1)}>‹</button>
              <span>{pg.pagina} de {pg.paginas}</span>
              <button type="button" aria-label="Próxima página" disabled={pg.pagina === pg.paginas} onClick={() => setPagina(pg.pagina + 1)}>›</button>
            </div>
          ) : <span />}
          <button type="button" className={s.verTudo} onClick={() => setCompleta(true)}>Ver lista completa</button>
        </div>
      )}
      <div className={s.legenda}>{LEGENDA.map(([c, t]) => <span key={t} style={{ ["--c" as string]: c }}>{t}</span>)}</div>
      {completa && (
        <ModalRenovar mes={mes} atual={atual} aoMudarMes={setMes} itens={[...vencidas, ...aVencer]}
          mostrarDono={mostrarDono} aoFechar={() => setCompleta(false)} />
      )}
    </section>
  );
}

/** Lista completa do mês numa janela larga (tabela), para quando a página do cartão não basta. */
function ModalRenovar({ mes, atual, aoMudarMes, itens, mostrarDono, aoFechar }: {
  mes: string; atual: string; aoMudarMes(m: string): void; itens: ItemRenovar[]; mostrarDono: boolean; aoFechar(): void;
}) {
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    fecharRef.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("keydown", tecla); anterior?.focus?.(); };
  }, [aoFechar]);

  return (
    <div className={s.veu} onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="pp-modal-titulo">
        <div className={s.modalTopo}>
          <h2 id="pp-modal-titulo">A renovar <small>· {itens.length} em {nomeMes(mes, "ano")}</small></h2>
          <SeletorMes mes={mes} atual={atual} aoMudar={aoMudarMes} />
          <button ref={fecharRef} type="button" className={s.fechar} onClick={aoFechar}>Fechar</button>
        </div>
        {itens.length === 0 ? <p className={s.vazio}>Nenhuma apólice a renovar em {nomeMes(mes, "ano")}.</p> : (
          <div className={s.modalCorpo}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th>Prazo</th><th>Cliente</th><th>Ramo</th><th>Seguradora</th><th>Apólice</th><th>Fim da vigência</th>
                  {mostrarDono && <th>Produtor</th>}
                </tr>
              </thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={`${i.apolice}|${i.fim}|${k}`}>
                    <td><span className={`${s.chip} ${s[`k-${i.faixa}`]}`}>{textoPrazo(i.dias)}</span></td>
                    <td>{i.cli}</td><td>{i.ramo}</td><td>{i.seg}</td><td>{i.apolice}</td><td>{dataBR(i.fim)}</td>
                    {mostrarDono && <td>{nomeCurto(i.colab)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
