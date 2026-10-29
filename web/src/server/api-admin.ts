import { NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/server/auth";

export const SEM_CACHE = { "Cache-Control": "no-store" };

export function resposta(corpo: unknown, status = 200): NextResponse {
  return NextResponse.json(corpo, { status, headers: SEM_CACHE });
}
export const erro400 = (erro: string) => resposta({ erro }, 400);

type Sessao = NonNullable<Awaited<ReturnType<typeof usuarioDaRequisicao>>>;

/** Exige sessão e um dos papéis (defesa em profundidade além do proxy). */
export async function exigirPapel(papeis: string[]): Promise<{ u: Sessao } | { res: NextResponse }> {
  const u = await usuarioDaRequisicao();
  if (!u) return { res: resposta({ erro: "Não autenticado" }, 401) };
  if (!papeis.includes(u.role)) return { res: resposta({ erro: "Sem permissão" }, 403) };
  return { u };
}

/** Lê o corpo como objeto JSON; null se malformado. */
export async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const c = await req.json();
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const indisponivel = () => resposta({ erro: "Banco indisponível" }, 503);
