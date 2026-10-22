import { bypassAtivo } from "./auth-core";
import type { DataISO } from "@/domain/tipos";

type Env = Record<string, string | undefined>;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "Hoje" do servidor: data civil em America/Sao_Paulo (o processo na Vercel roda em UTC,
 * então a data UTC adiantaria o dia entre 21h e 24h de Brasília).
 * Com o bypass de paridade ativo (mesma guarda da autenticação), honra PARITY_HOJE (YYYY-MM-DD).
 */
export function hojeServidor(agora: Date = new Date(), env: Env = process.env): DataISO {
  if (bypassAtivo(env) && env.PARITY_HOJE && /^\d{4}-\d{2}-\d{2}$/.test(env.PARITY_HOJE)) {
    return env.PARITY_HOJE;
  }
  const p = Object.fromEntries(fmt.formatToParts(agora).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
