import MeuPainel from "./MeuPainel";

// O conteúdo depende de /api/dados e /api/eu (cliente): sem UI instantânea a validar.
export const instant = false;

export default function Pagina() {
  return <MeuPainel />;
}
