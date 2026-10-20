"use client";
import { useEffect, useRef } from "react";
import { useFiltros } from "@/client/filtros";
import type { FiltrosGlobais as Filtros } from "@/domain/filtros";
import { MultiSelect } from "./MultiSelect";
import { BotoesTipo } from "./BotoesTipo";
import s from "./FiltrosGlobais.module.css";

type CampoData = "vigIni" | "vigFim" | "emIni" | "emFim";
const CAMPOS: [string, CampoData][] = [["f-vig-s", "vigIni"], ["f-vig-e", "vigFim"], ["f-em-s", "emIni"], ["f-em-e", "emFim"]];

// Barra .filters do index.html. Os inputs de data são não controlados e escutam 'input' e
// 'change' nativos: assim reagem tanto à digitação quanto a `el.value = x` seguido de
// dispatchEvent (o harness faz isso; um input controlado do React ignoraria esse caso).
export function FiltrosGlobais({ temProducao }: { temProducao: boolean }) {
  const { filtros, definir, limpar, opcoes, tipos } = useFiltros();
  const raiz = useRef<HTMLDivElement>(null);
  const atual = useRef(filtros);
  useEffect(() => { atual.current = filtros; }, [filtros]);

  // Estado → DOM (ex.: depois de "Limpar filtros" ou ao vir da URL).
  useEffect(() => {
    for (const [id, k] of CAMPOS) {
      const el = raiz.current?.querySelector<HTMLInputElement>(`#${id}`);
      if (el && el.value !== filtros[k]) el.value = filtros[k];
    }
  }, [filtros]);

  // DOM → estado.
  useEffect(() => {
    const els = CAMPOS.map(([id, k]) => [raiz.current!.querySelector<HTMLInputElement>(`#${id}`)!, k] as const);
    const ouvir = (el: HTMLInputElement, k: CampoData) => () => {
      if (el.value !== atual.current[k]) definir({ [k]: el.value } as Partial<Filtros>);
    };
    const tiras = els.map(([el, k]) => {
      const h = ouvir(el, k);
      el.addEventListener("input", h);
      el.addEventListener("change", h);
      return () => { el.removeEventListener("input", h); el.removeEventListener("change", h); };
    });
    return () => tiras.forEach((t) => t());
  }, [definir]);

  return (
    <div ref={raiz} className={`${s.filtros} filters`} style={{ opacity: temProducao ? 1 : 0.45 }}>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Vigência</span>
        <div className={`${s.parDatas} date-pair`}>
          <input type="date" id="f-vig-s" defaultValue={filtros.vigIni} />
          <span className={`${s.sepDatas} date-sep`}>→</span>
          <input type="date" id="f-vig-e" defaultValue={filtros.vigFim} />
        </div>
      </div>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Emissão</span>
        <div className={`${s.parDatas} date-pair`}>
          <input type="date" id="f-em-s" defaultValue={filtros.emIni} />
          <span className={`${s.sepDatas} date-sep`}>→</span>
          <input type="date" id="f-em-e" defaultValue={filtros.emFim} />
        </div>
      </div>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Colaborador</span>
        <MultiSelect id="ms-col" chave="col" valores={opcoes.col} selecionados={filtros.col} placeholder="Todos" onChange={(col) => definir({ col })} />
      </div>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Grupo de produção</span>
        <MultiSelect id="ms-grp" chave="grp" valores={opcoes.grp} selecionados={filtros.grp} placeholder="Todos" onChange={(grp) => definir({ grp })} />
      </div>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Ramo</span>
        <MultiSelect id="ms-ram" chave="ram" valores={opcoes.ram} selecionados={filtros.ram} placeholder="Todos" onChange={(ram) => definir({ ram })} />
      </div>
      <div className={`${s.grupo} f-group`}>
        <span className={`${s.rotulo} f-label`}>Seguradora</span>
        <MultiSelect id="ms-seg" chave="seg" valores={opcoes.seg} selecionados={filtros.seg} placeholder="Todas" onChange={(seg) => definir({ seg })} />
      </div>
      <div className={`${s.grupo} f-group`} style={{ flex: 1, minWidth: 220 }}>
        <span className={`${s.rotulo} f-label`}>Tipo de documento</span>
        <BotoesTipo tipos={tipos} ativos={filtros.tipos} onChange={(t) => definir({ tipos: t })} />
      </div>
      <div className={`${s.grupo} f-group`} style={{ marginLeft: "auto" }}>
        <button type="button" className="btn-sm" onClick={limpar}>↻ Limpar filtros</button>
      </div>
    </div>
  );
}
