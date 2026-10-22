import { signIn } from "@/server/auth";

export default function Entrar() {
  return (
    <main style={{ maxWidth: 380, margin: "20vh auto", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>Dashboard Corretora</h1>
      <p>Entre com a conta Microsoft 365 da empresa.</p>
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/" });
        }}
      >
        <button type="submit">Entrar com Microsoft 365</button>
      </form>
    </main>
  );
}
