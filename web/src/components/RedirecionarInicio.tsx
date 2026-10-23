"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePainel } from "@/client/painel";
import { useUsuario } from "@/client/usuario";

// Aba inicial como em applySharePointData: Sinistros quando só há sinistros, senão Visão geral.
// Exceção: com erro de produção abre a Visão geral, para o motivo aparecer de cara.
// Vendedor (ou escopo "nada", que é sempre de vendedor) vai para o Meu painel; espera /api/eu para decidir.
export function RedirecionarInicio() {
  const { base } = usePainel();
  const { usuario, carregando } = useUsuario();
  const router = useRouter();
  useEffect(() => {
    if (base.semAcesso || usuario?.role === "vendedor") { router.replace("/meu-painel"); return; }
    if (carregando) return;
    const aba = !base.linhas.length && base.sinistros.length && !base.erroProducao ? "sinistros" : "visao-geral";
    router.replace(`/${aba}${window.location.search}`);
  }, [base, usuario, carregando, router]);
  return null;
}
