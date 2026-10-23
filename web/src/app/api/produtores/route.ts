import { listarIgnorados, listarProdutores } from "@/server/db/client";
import { exigirPapel, indisponivel, resposta } from "@/server/api-admin";

export async function GET() {
  const a = await exigirPapel(["admin", "gestao"]);
  if ("res" in a) return a.res;
  try {
    const [produtores, ignorados] = await Promise.all([listarProdutores(), listarIgnorados()]);
    return resposta({ produtores, ignorados });
  } catch {
    return indisponivel();
  }
}
