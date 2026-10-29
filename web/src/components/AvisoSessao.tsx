"use client";
import { signIn } from "next-auth/react";
import s from "./AvisoSessao.module.css";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Faixa fixa no topo: a sessão não pôde ser renovada, os dados na tela são os da última carga boa. */
export function AvisoSessao({ desde }: { desde?: number }) {
  return (
    <div className={s.aviso} role="alert" id="aviso-sessao">
      <span>Sua sessão expirou — os dados podem estar desatualizados{desde !== undefined ? ` desde ${hhmm(desde)}` : ""}.</span>
      <button type="button" className="btn-sm"
        onClick={() => void signIn("microsoft-entra-id", { callbackUrl: window.location.href })}>Entrar novamente</button>
    </div>
  );
}

/** Aviso discreto: o servidor não responde há mais de 15 min, então os dados podem estar defasados. */
export function AvisoSemConexao({ desde }: { desde: number }) {
  return <div className={`${s.aviso} ${s.discreto}`} role="status" id="aviso-sem-conexao">Sem conexão com o servidor desde {hhmm(desde)}</div>;
}

const diaHora = (ms: number) => new Date(ms).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

/** Aviso discreto: o painel abriu com a cópia salva neste navegador enquanto a base nova chega. */
export function AvisoDadosSalvos({ salvoEm, falhou }: { salvoEm: number; falhou: boolean }) {
  return (
    <div className={`${s.aviso} ${s.discreto}`} role="status" id="aviso-dados-salvos" data-so-novo="">
      {falhou
        ? `Não foi possível atualizar agora. Mostrando os dados salvos em ${diaHora(salvoEm)}.`
        : `Mostrando os dados salvos em ${diaHora(salvoEm)}. Atualizando…`}
    </div>
  );
}
