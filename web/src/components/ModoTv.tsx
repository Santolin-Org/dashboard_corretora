"use client";
import { useEffect, useSyncExternalStore } from "react";

// ── Modo TV (main.js applyTvMode/toggleTvMode) ─────────────────────────────────
// Esconde as barras de filtro para exibição passiva (ex.: TV do time). Preferência salva
// em localStorage['tvMode'] ('1'/'0'); a classe 'tv-mode' no <body> faz o resto (tokens.css).
const CHAVE = "tvMode";
const ouvintes = new Set<() => void>();

function ler(): boolean {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
}
function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  const storage = (e: StorageEvent) => { if (e.key === CHAVE) cb(); };
  window.addEventListener("storage", storage);
  return () => { ouvintes.delete(cb); window.removeEventListener("storage", storage); };
}

export function alternarModoTv(): void {
  const on = !document.body.classList.contains("tv-mode");
  try { localStorage.setItem(CHAVE, on ? "1" : "0"); } catch { /* sem storage: vale só nesta página */ }
  document.body.classList.toggle("tv-mode", on);
  ouvintes.forEach((f) => f());
}

export function useModoTv(): boolean {
  return useSyncExternalStore(assinar, ler, () => false);
}

/** Aplica a classe no <body> conforme a preferência salva (montar uma vez no layout). */
export function ModoTvEfeito(): null {
  const on = useModoTv();
  useEffect(() => { document.body.classList.toggle("tv-mode", on); }, [on]);
  return null;
}

export function BotaoModoTv() {
  const on = useModoTv();
  return (
    <button type="button" className="btn-sm" id="tv-mode-btn" onClick={alternarModoTv}>
      {on ? "📺 Sair do modo TV" : "📺 Modo TV"}
    </button>
  );
}
