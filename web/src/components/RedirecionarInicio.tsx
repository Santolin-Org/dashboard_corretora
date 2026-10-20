"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePainel } from "@/client/painel";

// Aba inicial como em applySharePointData: Sinistros quando só há sinistros, senão Visão geral.
export function RedirecionarInicio() {
  const { base } = usePainel();
  const router = useRouter();
  useEffect(() => {
    const aba = !base.linhas.length && base.sinistros.length ? "sinistros" : "visao-geral";
    router.replace(`/${aba}${window.location.search}`);
  }, [base, router]);
  return null;
}
