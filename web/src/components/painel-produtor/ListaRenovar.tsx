"use client";
import { useMemo, useState } from "react";
import { usePainel } from "@/client/painel";
import {
  aRenovar, CORES_FAIXA, mesAnterior, mesDe, mesSeguinte, nomeCurto, nomeMes, textoPrazo, type ItemRenovar,
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

/** 4.2 — apólices N/R com fim de vigência no mês escolhido (abre no mês de hoje). */
export function ListaRenovar({ nomes, mostrarDono }: { nomes: ReadonlySet<string>; mostrarDono: boolean }) {
  const { base } = usePainel();
  const atual = mesDe(base.hoje);
  const [mes, setMes] = useState(atual);
  const [min, setMin] = useState(lerMin);
  const { vencidas, aVencer } = useMemo(() => aRenovar(base.linhas, nomes, mes, base.hoje), [base, nomes, mes]);
  const n = vencidas.length + aVencer.length;
  const alternar = () => { setMin(!min); gravarMin(!min); };

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
    <section className={s.card} aria-labelledby="pp-renovar-titulo">
      <div className={s.cabeca}>
        <div>
          <h2 id="pp-renovar-titulo">A renovar <small>· {n} em {nomeMes(mes)}</small></h2>
          <div className={s.sub}>Novas e renovações com fim de vigência no mês, ainda não renovadas no Quiver</div>
        </div>
        <div className={s.seletor}>
          <button type="button" aria-label="Mês anterior" onClick={() => setMes(mesAnterior(mes))}>‹</button>
          <strong>{nomeMes(mes, "ano")}</strong>
          {mes === atual && <em>atual</em>}
          <button type="button" aria-label="Próximo mês" onClick={() => setMes(mesSeguinte(mes))}>›</button>
        </div>
      </div>
      {n === 0 && <p className={s.vazio}>Nenhuma apólice a renovar em {nomeMes(mes, "ano")}.</p>}
      {vencidas.length > 0 && (
        <>
          <button type="button" className={s.grupo} aria-expanded={!min} onClick={alternar}>
            <span>{min ? "▸" : "▾"} Vencidas em {nomeMes(mes)} sem renovação · {vencidas.length}</span>
            <u>{min ? "mostrar" : "minimizar"}</u>
          </button>
          {!min && <ul className={s.lista}>{vencidas.map(item)}</ul>}
        </>
      )}
      {aVencer.length > 0 && <ul className={s.lista}>{aVencer.map(item)}</ul>}
      <div className={s.legenda}>{LEGENDA.map(([c, t]) => <span key={t} style={{ ["--c" as string]: c }}>{t}</span>)}</div>
    </section>
  );
}
