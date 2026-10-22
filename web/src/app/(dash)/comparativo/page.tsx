import { AbaSobDemanda } from "@/components/AbaSobDemanda";

// O conteúdo depende de /api/dados (cliente): sem UI instantânea a validar.
export const instant = false;

export default function Pagina() {
  return <AbaSobDemanda id="comparativo" />;
}
