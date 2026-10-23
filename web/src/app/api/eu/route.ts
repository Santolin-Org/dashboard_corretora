import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";
import { bypassAtivo } from "@/server/auth-core";
import { nomesDoUsuario } from "@/server/db/client";

const SEM_CACHE = { "Cache-Control": "no-store" };

/** Quem está logado e os nomes de COLABORADOR vinculados a ele (só os próprios). */
export async function GET() {
  const u = await usuarioDaRequisicao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401, headers: SEM_CACHE });
  let nomes: string[];
  try {
    // Bypass de paridade: usuário sintético, sem vínculos e sem banco.
    nomes = bypassAtivo() ? [] : await nomesDoUsuario(u.email);
  } catch {
    return NextResponse.json({ erro: "Banco indisponível" }, { status: 503, headers: SEM_CACHE });
  }
  return NextResponse.json({ email: u.email, nome: u.nome, role: u.role, nomes }, { headers: SEM_CACHE });
}
