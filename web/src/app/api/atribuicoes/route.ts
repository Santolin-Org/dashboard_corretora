import { desfazerAtribuicao, listarAtribuicoes, nomesDoUsuario, salvarAtribuicao } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";

// Atribuições de renovação (spec 2026-11-10). Leitura: gestão/admin veem todas; vendedor só as para ou de um nome
// dele. Escrita (atribuir/desfazer): só gestão e admin.
const GESTORES = ["gestao", "admin"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function chave(c: Record<string, unknown>): { seg: string; apolice: string; fim: string } | null {
  const seg = texto(c.seg), apolice = texto(c.apolice), fim = texto(c.fim);
  return seg && apolice && DATA_ISO.test(fim) ? { seg, apolice, fim } : null;
}

export async function GET() {
  const a = await exigirPapel([...GESTORES, "vendedor"]);
  if ("res" in a) return a.res;
  try {
    const todas = await listarAtribuicoes();
    if (a.u.role !== "vendedor") return resposta({ atribuicoes: todas });
    const nomes = new Set(await nomesDoUsuario(a.u.email));
    return resposta({ atribuicoes: todas.filter((x) => nomes.has(x.para) || nomes.has(x.de)) });
  } catch {
    return indisponivel();
  }
}

export async function PUT(req: Request) {
  const a = await exigirPapel(GESTORES);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  const k = c && chave(c);
  const para = c ? texto(c.para) : "", de = c ? texto(c.de) : "";
  if (!k || !para || !de) return erro400("Requisição inválida.");
  try {
    await salvarAtribuicao({ ...k, para, de }, a.u.email);
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
