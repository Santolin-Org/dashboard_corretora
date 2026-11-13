"use client";
import { useCallback, useEffect, useState } from "react";
import { chaveVinculoAntiga, chaveVinculoRen, type ChaveVinculoAntiga, type VinculoRenovacao } from "@/domain/vinculos-renovacao";

export type NovoVinculo = Omit<VinculoRenovacao, "por" | "em">;
/** 409 (já existe vínculo na antiga ou na R) vira `ok: false` com os conflitos; outros erros lançam. */
export type ResultadoVinculo = { ok: true; desfeitos: VinculoRenovacao[] } | { ok: false; conflitos: VinculoRenovacao[] };
export type EstadoVinculos = {
  vinculos: VinculoRenovacao[];
  /** GET falhou: lista vazia e as telas avisam. */
  erro: boolean;
  vincular(v: NovoVinculo, substituir?: boolean): Promise<ResultadoVinculo>;
  desfazer(k: ChaveVinculoAntiga): Promise<void>;
};

const URL_API = "/api/vinculos-renovacao";

async function enviar(method: "PUT" | "DELETE", corpo: unknown): Promise<Response> {
  return fetch(URL_API, {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
}
async function falhar(r: Response): Promise<never> {
  const c = (await r.json().catch(() => null)) as { erro?: string } | null;
  throw new Error(c?.erro ?? "Não foi possível salvar o vínculo.");
}

/** Vínculos manuais de renovação (spec 2026-11-13), no molde de useAtribuicoes: busca quando `ativo` e a cada
 *  `sinal` novo; vincular/desfazer gravam no servidor e atualizam a lista local. */
export function useVinculosRenovacao(ativo: boolean, sinal?: unknown): EstadoVinculos {
  const [vinculos, setVinculos] = useState<VinculoRenovacao[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    Promise.resolve()
      .then(() => fetch(URL_API, { credentials: "same-origin" }))
      .then((r) => (r.ok ? (r.json() as Promise<{ vinculos?: VinculoRenovacao[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        if (!vivo) return;
        const novos = Array.isArray(c.vinculos) ? c.vinculos : [];
        setVinculos((l) => (l.length === 0 && novos.length === 0 ? l : novos));
        setErro(false);
      })
      .catch(() => { if (vivo) { setVinculos((l) => (l.length ? [] : l)); setErro(true); } });
    return () => { vivo = false; };
  }, [ativo, sinal]);

  const vincular = useCallback(async (v: NovoVinculo, substituir = false): Promise<ResultadoVinculo> => {
    const r = await enviar("PUT", { ...v, substituir });
    if (r.status === 409) {
      const c = (await r.json().catch(() => null)) as { conflitos?: VinculoRenovacao[] } | null;
      return { ok: false, conflitos: c?.conflitos ?? [] };
    }
    if (!r.ok) return falhar(r);
    const { desfeitos = [] } = (await r.json()) as { desfeitos?: VinculoRenovacao[] };
    const sai = new Set([chaveVinculoAntiga(v), ...desfeitos.map(chaveVinculoAntiga)]);
    const saiRen = new Set([chaveVinculoRen(v), ...desfeitos.map(chaveVinculoRen)]);
    const novo: VinculoRenovacao = { ...v, por: "", em: new Date().toISOString() };
    setVinculos((l) => [...l.filter((x) => !sai.has(chaveVinculoAntiga(x)) && !saiRen.has(chaveVinculoRen(x))), novo]);
    return { ok: true, desfeitos };
  }, []);

  const desfazer = useCallback(async (k: ChaveVinculoAntiga) => {
    const r = await enviar("DELETE", k);
    if (!r.ok) return falhar(r);
    setVinculos((l) => l.filter((x) => chaveVinculoAntiga(x) !== chaveVinculoAntiga(k)));
  }, []);

  return { vinculos, erro, vincular, desfazer };
}
