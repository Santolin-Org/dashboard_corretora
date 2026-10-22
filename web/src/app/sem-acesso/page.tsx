import { signOut } from "@/server/auth";
import { TelaAcesso, estiloAcesso as s } from "@/components/TelaAcesso";

export default function SemAcesso() {
  return (
    <TelaAcesso titulo="Sem acesso">
      <p className={s.texto}>Esta conta não está autorizada a ver o painel. Peça a um administrador para incluí-la na lista.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/entrar" });
        }}
      >
        <button type="submit" className={`${s.botao} ${s.secundario}`}>Sair</button>
      </form>
    </TelaAcesso>
  );
}
