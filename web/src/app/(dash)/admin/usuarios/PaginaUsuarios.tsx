"use client";
import { useUsuario } from "@/client/usuario";
import { UsuariosVinculos } from "@/components/admin/UsuariosVinculos";

/** Só admin vê a tela (o proxy já bloqueia os demais; aqui nem monta, para não chamar as APIs). */
export default function PaginaUsuarios() {
  const { usuario } = useUsuario();
  if (usuario?.role !== "admin") return null;
  return <UsuariosVinculos />;
}
