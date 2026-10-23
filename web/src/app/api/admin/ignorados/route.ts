import { ignorarNome } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";

export async function PUT(req: Request) {
  const a = await exigirPapel(["admin"]);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  if (!c) return erro400("Requisição inválida.");
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (!nome) return erro400("Nome da planilha inválido.");
  if (typeof c.ignorar !== "boolean") return erro400("Requisição inválida.");
  try {
    await ignorarNome(nome, c.ignorar, a.u.email);
    return resposta({ ok: true });
  } catch {
    return indisponivel();
  }
}
