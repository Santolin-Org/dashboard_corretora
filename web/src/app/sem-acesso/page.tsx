import { signOut } from "@/server/auth";

export default function SemAcesso() {
  return (
    <main style={{ maxWidth: 420, margin: "20vh auto", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>Sem acesso</h1>
      <p>Esta conta não está autorizada a ver o painel. Peça a um administrador para incluí-la na lista.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/entrar" });
        }}
      >
        <button type="submit">Sair</button>
      </form>
    </main>
  );
}
