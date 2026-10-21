import { redirect } from "next/navigation";
import { codigoErroAuth } from "@/server/auth-core";

// Página de erro do Auth.js (pages.error). AccessDenied (conta fora da lista) vai para /sem-acesso;
// qualquer outro código (ex.: Configuration) aparece aqui, em vez de ser mascarado como "sem acesso".
export default async function ErroLogin({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const r = codigoErroAuth((await searchParams).error);
  if ("destino" in r) redirect(r.destino);
  return (
    <main style={{ maxWidth: 420, margin: "20vh auto", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>Erro ao entrar</h1>
      <p>Não foi possível concluir o login. Tente de novo; se o erro continuar, envie o código abaixo ao administrador.</p>
      <p>Código do erro: <code id="erro-login-codigo">{r.codigo}</code></p>
      <p><a href="/entrar">Voltar para a tela de entrada</a></p>
    </main>
  );
}
