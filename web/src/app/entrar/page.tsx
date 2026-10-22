import { signIn } from "@/server/auth";
import { TelaAcesso, estiloAcesso as s } from "@/components/TelaAcesso";

export default function Entrar() {
  return (
    <TelaAcesso titulo="Dashboard Corretora">
      <p className={s.texto}>Entre com a conta Microsoft 365 da empresa.</p>
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/" });
        }}
      >
        <button type="submit" className={s.botao} id="entrar-microsoft">
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Entrar com Microsoft 365
        </button>
      </form>
    </TelaAcesso>
  );
}
