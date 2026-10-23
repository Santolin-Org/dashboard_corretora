import Produtores from "./Produtores";

// O conteúdo depende de /api/dados e /api/produtores (cliente): sem UI instantânea a validar.
export const instant = false;

export default function Pagina() {
  return <Produtores />;
}
