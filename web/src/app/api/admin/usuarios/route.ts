import { listarIgnorados, listarUsuarios, salvarUsuario } from "@/server/db/client";
import { erro400, exigirPapel, indisponivel, lerCorpo, resposta } from "@/server/api-admin";

const PAPEIS = ["admin", "gestao", "vendedor"] as const;
type PapelUsuario = (typeof PAPEIS)[number];

export async function GET() {
  const a = await exigirPapel(["admin"]);
  if ("res" in a) return a.res;
  try {
    const [usuarios, ignorados] = await Promise.all([listarUsuarios(), listarIgnorados()]);
    return resposta({ usuarios, ignorados });
  } catch {
    return indisponivel();
  }
}

export async function POST(req: Request) {
  const a = await exigirPapel(["admin"]);
  if ("res" in a) return a.res;
  const c = await lerCorpo(req);
  if (!c) return erro400("Requisição inválida.");
  const email = typeof c.email === "string" ? c.email.trim() : "";
  if (!email.includes("@")) return erro400("E-mail inválido.");
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (!nome) return erro400("Nome inválido.");
  if (typeof c.role !== "string" || !PAPEIS.includes(c.role as PapelUsuario)) return erro400("Papel inválido.");
  if (c.id !== undefined && c.id !== null && (typeof c.id !== "number" || !Number.isInteger(c.id))) return erro400("Requisição inválida.");
  try {
    const eu = (await listarUsuarios()).find((x) => x.email === a.u.email.trim().toLowerCase());
    if (!eu) return resposta({ erro: "Sem permissão" }, 403);
    const r = await salvarUsuario(
      { id: typeof c.id === "number" ? c.id : undefined, email, nome, role: c.role as PapelUsuario, ativo: c.ativo !== false },
      { id: eu.id, email: eu.email },
    );
    return r.ok ? resposta({ ok: true, id: r.id }) : erro400(r.erro);
  } catch {
    return indisponivel();
  }
}
