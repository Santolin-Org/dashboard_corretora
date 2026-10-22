"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { useFiltros } from "@/client/filtros";
import { usePainel } from "@/client/painel";
import { exportarSlidesPdf } from "@/client/exportarPdf";
import { buildKickoffSlides, dadosChooser, navegarSlide, nomeArquivoKickoff, type ModoKickoff, type Slide } from "@/domain/apresentacao";
import { getMetaPcts } from "@/domain/metas";
import { useEstadoMetas } from "../metas/estado";
import { Chooser } from "./Chooser";
import { SlideView } from "./Slides";

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// Modo apresentação (#kickoff-mode; AbaSobDemanda cria o contêiner): no antigo era um overlay sobre o painel, aqui é a rota
// /apresentacao. "Sair ✕" e Esc voltam para /metas com os filtros (?f=) — de onde o botão "▶ Modo apresentação" abre.
// Teclado (só nos slides): → PageDown Espaço avançam; ← PageUp voltam. Os % de meta são os digitados na aba Metas.
export default function Apresentacao() {
  const { base } = usePainel();
  const { filtros } = useFiltros();
  const e = useEstadoMetas();
  const router = useRouter();
  const linhas = base.linhas, hoje = base.hoje;
  const { mn, mr } = getMetaPcts(e.novos, e.renov);
  // kickoffSlides / kickoffIdx / kickoffMode; `gen` conta cada redesenho do slide (os gráficos são recriados a cada um).
  const [mostra, setMostra] = useState<{ slides: Slide[]; idx: number; gen: number } | null>(null);
  const [pdf, setPdf] = useState<string | null>(null);
  const chooser = useMemo(() => dadosChooser(filtros), [filtros]);

  const sair = useCallback(() => { router.push(`/metas${window.location.search}`); }, [router]);
  useEffect(() => {
    if (linhas.length) return;
    alert("Carregue os dados antes de gerar a apresentação.");
    router.replace(`/metas${window.location.search}`);
  }, [linhas.length, router]);

  const iniciar = (modo: ModoKickoff, semana?: number) => {
    const slides = buildKickoffSlides(linhas, filtros, hoje, mn, mr, modo, semana);
    if (!slides.length) { alert("Não há dados suficientes para gerar a apresentação neste período."); return; }
    setMostra({ slides, idx: 0, gen: 1 });
  };
  const ir = useCallback((d: number, abs = false) => {
    setMostra((m) => (m ? { ...m, idx: abs ? d : navegarSlide(m.idx, d, m.slides.length), gen: m.gen + 1 } : m));
  }, []);

  // kickoffKeyHandler: Esc sai em qualquer tela; as setas só nos slides.
  const noShow = mostra !== null;
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") sair();
      else if (noShow && (ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ")) { ev.preventDefault(); ir(1); }
      else if (noShow && (ev.key === "ArrowLeft" || ev.key === "PageUp")) { ev.preventDefault(); ir(-1); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [noShow, sair, ir]);

  const mostraRef = useRef(mostra);
  useEffect(() => { mostraRef.current = mostra; });
  const exportarPdf = async () => {
    const m = mostraRef.current;
    if (!m || !m.slides.length || pdf !== null) return;
    const salvo = m.idx;
    setPdf("Gerando...");
    try {
      await exportarSlidesPdf({
        total: m.slides.length, arquivo: nomeArquivoKickoff(m.slides),
        progresso: (i, n) => setPdf(`Gerando... ${i}/${n}`),
        mostrar: async (i) => {
          flushSync(() => ir(i, true));
          await quadro(); // espera o fade do slide (kf-in .35s) e o gráfico desenhar
          await esperar(450);
          return document.querySelector<HTMLElement>("#kf-stage .kf-page");
        },
      });
    } catch (err) {
      if ((err as Error).message === "bibliotecas") alert("Bibliotecas de PDF não carregaram (verifique a conexão). Tente recarregar a página.");
      else { console.error("[kickoff PDF]", err); alert("Não foi possível gerar o PDF: " + ((err as Error).message || err)); }
    } finally {
      flushSync(() => ir(salvo, true));
      setPdf(null);
    }
  };

  const slide = mostra ? mostra.slides[mostra.idx] : null;
  const oculto = mostra ? undefined : { display: "none" } as const;
  return (
    <>
      <button type="button" className="kf-exit" title="Sair (Esc)" onClick={sair}>Sair ✕</button>
      {" "}
      <button type="button" className="kf-back" title="Voltar às opções" style={oculto} onClick={() => setMostra(null)}>↩ Opções</button>
      {" "}
      <div className="kf-stage" id="kf-stage">
        {mostra && slide ? <SlideView key={mostra.gen} s={slide} gen={mostra.gen} /> : <Chooser dados={chooser} aoIniciar={iniciar} />}
      </div>
      {" "}
      <div className="kf-controls" style={oculto}>
        <button type="button" className="kf-nav" onClick={() => ir(-1)}>‹ Anterior</button>
        {" "}
        <div className="kf-dots" id="kf-dots">
          {mostra?.slides.map((_, i) => <span key={i} className={`kf-pgdot${i === mostra.idx ? " on" : ""}`} onClick={() => ir(i, true)}></span>)}
        </div>
        {" "}
        <button type="button" className="kf-nav" onClick={() => ir(1)}>Próximo ›</button>
        {" "}
        <button type="button" className="kf-nav kf-pdf-btn" id="kf-pdf-btn" title="Baixar a apresentação em PDF" disabled={pdf !== null} onClick={() => void exportarPdf()}>{pdf ?? "↓ Exportar PDF"}</button>
      </div>
    </>
  );
}
