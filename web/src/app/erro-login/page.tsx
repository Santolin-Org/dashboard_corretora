import { redirect } from "next/navigation";
import { codigoErroAuth } from "@/server/auth-core";
import { TelaAcesso, estiloAcesso as s } from "@/components/TelaAcesso";

// Lê ?error= na requisição (sem UI instantânea a pré-renderizar).
export const instant = false;

// Página de erro do Auth.js (pages.error). AccessDenied (conta fora da lista) vai para /sem-acesso;
// qualquer outro código (ex.: Configuration) aparece aqui, em vez de ser mascarado como "sem acesso".
export default async function ErroLogin({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const r = codigoErroAuth((await searchParams).error);
  if ("destino" in r) redirect(r.destino);
  return (
    <TelaAcesso titulo="Erro ao entrar">
      <p className={s.texto}>
        Não foi possível concluir o login. Tente de novo; se o erro continuar, envie o código abaixo ao administrador.
      </p>
      <p className={s.texto}>Código do erro: <code id="erro-login-codigo" className={s.codigo}>{r.codigo}</code></p>
      <a href="/entrar" className={`${s.botao} ${s.secundario}`}>Voltar para a tela de entrada</a>
    </TelaAcesso>
  );
}
