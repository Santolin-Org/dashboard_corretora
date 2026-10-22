import type { ReactNode } from "react";
import s from "./TelaAcesso.module.css";

// Moldura das telas fora do painel (entrar, sem acesso, erro de login): cartão centrado no tema do app.
export function TelaAcesso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className={s.tela}>
      <section className={s.cartao} aria-labelledby="tela-acesso-titulo">
        <p className={s.marca}>Santolin Seguros</p>
        <h1 id="tela-acesso-titulo" className={s.titulo}>{titulo}</h1>
        {children}
      </section>
    </main>
  );
}

export const estiloAcesso = s;
