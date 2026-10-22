"use client";
import { useEffect, useSyncExternalStore } from "react";
import { PAINEL_TV_PADRAO, painelTv, type PainelTv } from "@/domain/paineis-tv";

// Painel escolhido para a Exibição TV, salvo POR APARELHO (localStorage['tvPainel']): o notebook
// da TV lembra o que mostrar. `?painel=<id>` na URL abre direto num painel e passa a ser o salvo.
const CHAVE = "tvPainel";
const ouvintes = new Set<() => void>();

function ler(): string {
  try { return painelTv(localStorage.getItem(CHAVE)).id; } catch { return PAINEL_TV_PADRAO; }
}
function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  const aoStorage = (e: StorageEvent) => { if (e.key === CHAVE) cb(); };
  window.addEventListener("storage", aoStorage);
  return () => { ouvintes.delete(cb); window.removeEventListener("storage", aoStorage); };
}

export function escolherPainelTv(id: string): void {
  try { localStorage.setItem(CHAVE, painelTv(id).id); } catch { /* sem storage: vale só nesta sessão da página */ }
  ouvintes.forEach((cb) => cb());
}

export function usePainelTv(): PainelTv {
  const id = useSyncExternalStore(assinar, ler, () => PAINEL_TV_PADRAO);
  // `?painel=` na URL vence o salvo (e fica salvo) — só ids conhecidos.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("painel");
    if (p && painelTv(p).id === p && p !== ler()) escolherPainelTv(p);
  }, []);
  return painelTv(id);
}
