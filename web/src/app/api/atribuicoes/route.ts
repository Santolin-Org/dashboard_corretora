import { desfazerAtribuicao, listarAtribuicoes, nomesDoUsuario, salvarAtribuicao, salvarAtribuicoes } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";
import { bypassAtivo } from "@/server/auth-core";
import { pertenceA } from "@/domain/painel-produtor";

// Atribuições de renovação (spec 2026-11-10). Leitura: gestão/admin veem todas; vendedor só as para ou de um nome
// dele. Escrita (atribuir/desfazer): só gestão e admin.
const GESTORES = ["gestao", "admin"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** Teto de um lote (a tela seleciona no máximo a lista filtrada do período). */
const MAX_LOTE = 1000;

function atribuicao(c: unknown): { seg: string; apolice: string; fim: string; para: string; de: string } | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const k = chave(o), para = texto(o.para), de = texto(o.de);
  return k && para && de ? { ...k, para, de } : null;
}

function chave(c: Record<string, unknown>): { seg: string; apolice: string; fim: string } | null {
  const seg = texto(c.seg), apolice = texto(c.apolice), fim = texto(c.fim);
  return seg && apolice && DATA_ISO.test(fim) ? { seg, apolice, fim } : null;
}

export async function GET() {
  const a = await exigirPapel([...GESTORES, "vendedor"]);
  if ("res" in a) return a.res;
  // Bypass de paridade (sem banco, como /api/eu): nenhuma atribuição.
  if (bypassAtivo()) return resposta({ atribuicoes: [] });
  try {
    const todas = await listarAtribuicoes();
    if (a.u.role !== "vendedor") return resposta({ atribuicoes: todas });
    const nomes = new Set(await nomesDoUsuario(a.u.email));
    // Nome composto ("A , B") vale para A e para B, como no resto do painel.
    return resposta({ atribuicoes: todas.filter((x) => pertenceA({ colab: x.para }, nomes) || pertenceA({ colab: x.de }, nomes)) });
  } catch {
    return indisponivel();
  }
}

export async function PUT(req: Request) {
  const a = await exigirPapel(GESTORES);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  // Lote ({ itens: [...] }): tudo ou nada — um item inválido recusa o lote inteiro.
  if (c && "itens" in c) {
    const itens = Array.isArray(c.itens) ? c.itens.map(atribuicao) : [];
    if (!itens.length || itens.length > MAX_LOTE || itens.some((x) => !x)) return erro400("Requisição inválida.");
    try {
      await salvarAtribuicoes(itens as NonNullable<(typeof itens)[number]>[], a.u.email);
      return resposta({ ok: true, gravadas: itens.length });
    } catch {
      return indisponivel();
    }
  }
  const um = atribuicao(c);
  if (!um) return erro400("Requisição inválida.");
  try {
    await salvarAtribuicao(um, a.u.email);
    return resposta({ ok: true });
  } catch {
    return indisponivel();
  }
}

export async function DELETE(req: Request) {
  const a = await exigirPapel(GESTORES);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  const k = c && chave(c);
  if (!k) return erro400("Requisição inválida.");
  try {
    return (await desfazerAtribuicao(k, a.u.email)) ? resposta({ ok: true }) : resposta({ erro: "Atribuição não encontrada." }, 404);
  } catch {
    return indisponivel();
  }
}
