import PaginaUsuarios from "./PaginaUsuarios";

// O conteúdo depende de /api/admin/usuarios e /api/dados (cliente): sem UI instantânea a validar.
export const instant = false;

export default function Pagina() {
  return <PaginaUsuarios />;
}
