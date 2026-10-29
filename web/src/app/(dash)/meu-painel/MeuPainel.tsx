"use client";
import { useMemo } from "react";
import { usePainel } from "@/client/painel";
import { useUsuario } from "@/client/usuario";
import { AvisoFalhaUsuario, AvisoSemVinculo, PainelProdutor } from "@/components/painel-produtor/PainelProdutor";

/** Meu painel: o painel do produtor com os nomes vinculados ao login (qualquer papel). */
export default function MeuPainel() {
  const { base } = usePainel();
  const { usuario, carregando, falhou, recarregar } = useUsuario();
  const chaveNomes = usuario?.nomes.join("\n") ?? "";
  const nomes = useMemo(() => new Set(chaveNomes ? chaveNomes.split("\n") : []), [chaveNomes]);
  if (carregando) return null; // a casca já está na tela
  // /api/eu falhou: não sabemos os nomes — "sem vínculo" só quando a resposta veio com nomes = [].
  if (!usuario && falhou) return <AvisoFalhaUsuario aoTentar={recarregar} />;
  if (base.semAcesso || nomes.size === 0) return <AvisoSemVinculo />;
  const primeiro = usuario?.nome.trim().split(/\s+/)[0] ?? "";
  return <PainelProdutor nomes={nomes} mostrarDono={false} saudacao={primeiro ? `Olá, ${primeiro}` : "Olá"} />;
}
