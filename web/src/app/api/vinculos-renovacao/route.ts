import { desfazerVinculoRenovacao, listarVinculosRenovacao, salvarVinculoRenovacao } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";
import { bypassAtivo } from "@/server/auth-core";
import { dentroDaJanela } from "@/domain/vinculos-renovacao";

// Vínculos manuais de renovação (spec 2026-11-13). Leitura: gestão, admin e vendedor (os números do vendedor dependem
// deles). Escrita (vincular/desfazer): só gestão e admin.
const GESTORES = ["gestao", "admin"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function chaveAntiga(o: Record<string, unknown>): { seg: string; apolice: string; fim: string } | null {
  const seg = texto(o.seg), apolice = texto(o.apolice), fim = texto(o.fim);
  return seg && apolice && DATA_ISO.test(fim) ? { seg, apolice, fim } : null;
}

export async function GET() {
  const a = await exigirPapel([...GESTORES, "vendedor"]);
  if ("res" in a) return a.res;
  if (bypassAtivo()) return resposta({ vinculos: [] });
  try {
    return resposta({ vinculos: await listarVinculosRenovacao() });
  } catch {
    return indisponivel();
  }
}

export async function PUT(req: Request) {
  const a = await exigirPapel(GESTORES);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  const k = c && chaveAntiga(c);
  const renSeg = texto(c?.renSeg), renApolice = texto(c?.renApolice), renVig = texto(c?.renVig);
  if (!k || !renSeg || !renApolice || !DATA_ISO.test(renVig)) return erro400("Requisição inválida.");
  if (!dentroDaJanela(k.fim, renVig)) return erro400("A renovação precisa começar até 90 dias depois do fim da apólice anterior.");
  try {
    const r = await salvarVinculoRenovacao({ ...k, renSeg, renApolice, renVig }, a.u.email, { substituir: c?.substituir === true });
    if (!r.ok) return resposta({ erro: "Já existe vínculo para esta apólice ou renovação.", conflitos: r.conflitos }, 409);
    return resposta(r);
  } catch {
    return indisponivel();
  }
}

export async function DELETE(req: Request) {
  const a = await exigirPapel(GESTORES);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  const k = c && chaveAntiga(c);
  if (!k) return erro400("Requisição inválida.");
  try {
    return (await desfazerVinculoRenovacao(k, a.u.email)) ? resposta({ ok: true }) : resposta({ erro: "Vínculo não encontrado." }, 404);
  } catch {
    return indisponivel();
  }
}
