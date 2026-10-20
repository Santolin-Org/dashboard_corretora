"use client";
import { useEffect, useRef, useState } from "react";
import s from "./MultiSelect.module.css";

// Porta de buildMultiSelect/renderMsListGeneric/updateMsTriggerGeneric (main.js 318–387).
// A lista fica sempre no DOM (escondida enquanto o dropdown está fechado, como no app
// antigo); cada opção é um checkbox com data-valor="<valor>", clicável pelo harness.

const FECHAR_TODOS = "ms-fechar-todos";

export type MultiSelectProps = {
  /** id do wrapper (ex.: 'ms-col'). */
  id: string;
  /** chave usada nos ids dos checkboxes: ms-<chave>-<valor saneado> (ex.: 'col'). */
  chave: string;
  valores: string[];
  /** Em ordem de marcação (o primeiro aparece no gatilho). */
  selecionados: string[];
  placeholder: string;
  onChange(novos: string[]): void;
};

export function MultiSelect({ id, chave, valores, selecionados, placeholder, onChange }: MultiSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);

  // Clique fora de qualquer multiselect fecha todos (closeAllDropdowns).
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".ms-wrap")) setAberto(false);
    };
    const fechar = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setAberto(false); };
    document.addEventListener("click", fora);
    document.addEventListener(FECHAR_TODOS, fechar);
    return () => { document.removeEventListener("click", fora); document.removeEventListener(FECHAR_TODOS, fechar); };
  }, [id]);

  useEffect(() => { if (aberto) buscaRef.current?.focus(); }, [aberto]);

  const sel = new Set(selecionados);
  const f = busca.toLowerCase();
  const filtrados = f ? valores.filter((v) => v.toLowerCase().includes(f)) : valores;

  const alternar = (v: string, marcar: boolean) =>
    onChange(marcar ? (sel.has(v) ? selecionados : [...selecionados, v]) : selecionados.filter((x) => x !== v));

  return (
    <div className={`${s.wrap} ms-wrap`} id={id}>
      <div
        className={`${s.trigger} ms-trigger${aberto ? " open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          document.dispatchEvent(new CustomEvent(FECHAR_TODOS, { detail: id }));
          if (!aberto) setBusca("");
          setAberto(!aberto);
        }}
      >
        {selecionados.length === 0 ? (
          <span className={`${s.triggerText} ms-trigger-text placeholder`}>{placeholder}</span>
        ) : (
          <span className={`${s.triggerText} ms-trigger-text`}>{selecionados[0]}</span>
        )}
        {selecionados.length > 1 && <span className={`${s.badge} ms-badge`}>+{selecionados.length - 1}</span>}
        <span className={`${s.arrow} ms-arrow`}>▼</span>
      </div>
      <div className={`${s.dropdown} ms-dropdown${aberto ? " open" : ""}`}>
        <input
          ref={buscaRef}
          type="text"
          className={`${s.search} ms-search`}
          placeholder="Buscar..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className={`${s.list} ms-list`}>
          {filtrados.length === 0 ? (
            <div className={`${s.empty} ms-empty`}>Nenhum resultado</div>
          ) : (
            filtrados.map((v) => {
              const idCb = `ms-${chave}-${v.replace(/\W/g, "_").slice(0, 30)}`;
              return (
                <div key={v} className={`${s.item} ms-item`}>
                  <input
                    type="checkbox"
                    id={idCb}
                    data-valor={v}
                    checked={sel.has(v)}
                    onChange={(e) => alternar(v, e.target.checked)}
                  />
                  <label htmlFor={idCb} title={v}>{v}</label>
                </div>
              );
            })
          )}
        </div>
        <div className={`${s.footer} ms-footer`}>
          <button type="button" onClick={() => onChange([...selecionados, ...valores.filter((v) => !sel.has(v))])}>Marcar todos</button>
          <button type="button" onClick={() => onChange([])}>Limpar</button>
        </div>
      </div>
    </div>
  );
}
