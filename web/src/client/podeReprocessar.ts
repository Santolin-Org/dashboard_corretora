"use client";
import { useEffect, useState } from "react";

/** Pergunta ao servidor (GET /api/fontes, que já autoriza) se o usuário pode reprocessar as fontes.
 *  O POST /api/fontes/reprocessar continua sendo a barreira de verdade; isto só decide se o botão aparece. */
export function usePodeReprocessar(ativo: boolean): boolean {
  const [pode, setPode] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    fetch("/api/fontes", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { podeReprocessar?: boolean } | null) => { if (vivo) setPode(c?.podeReprocessar === true); })
      .catch(() => { if (vivo) setPode(false); });
    return () => { vivo = false; };
  }, [ativo]);
  return pode;
}
