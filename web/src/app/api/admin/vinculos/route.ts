import { listarUsuarios, vincularNome } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";

export async function PUT(req: Request) {
  const a = await exigirPapel(["admin"]);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  if (!c) return erro400("Requisição inválida.");
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (!nome) return erro400("Nome da planilha inválido.");
  if (c.userId !== null && (typeof c.userId !== "number" || !Number.isInteger(c.userId))) return erro400("Requisição inválida.");
  try {
    if (c.userId !== null && !(await listarUsuarios()).some((u) => u.id === c.userId)) return erro400("Usuário não encontrado.");
    const r = await vincularNome(nome, c.userId as number | null, a.u.email);
    return r.ok ? resposta({ ok: true }) : erro400(r.erro);
  } catch {
    return indisponivel();
  }
}
