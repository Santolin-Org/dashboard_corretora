"use client";
import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Papel } from "@/server/db/schema";
import type { Usuario } from "@/client/usuario";
import type { BaseCliente } from "@/client/useBase";
import { ABAS } from "./Abas";
import { MenuExibicaoTv } from "./MenuExibicaoTv";
import s from "./BarraLateral.module.css";

export type GrupoBarra = { grupo: string; itens: { href: string; rotulo: string }[] };

const HREF_EXIBICAO_TV = "/exibicao-tv";
const ROTAS_ABAS = new Set<string>(ABAS.map((a) => `/${a.id}`));

const ICONES: Record<string, string> = {
  "/visao-geral": "◧", "/producao": "▤", "/retencao": "↻", "/crosssell": "⇄", "/comparativo": "≋", "/metas": "◎",
  "/sinistros": "⚠", "/meu-painel": "☺", "/produtores": "☺", "/apresentacao": "▶", [HREF_EXIBICAO_TV]: "📺",
  "/admin/usuarios": "⚙",
};

const ROTULO_PAPEL: Record<Papel, string> = { admin: "admin", gestao: "gestão", vendedor: "vendedor" };

/** Itens da barra por papel: o vendedor só tem o próprio painel; admin acrescenta o grupo Admin. */
export function itensDaBarra(role: Papel): GrupoBarra[] {
  if (role === "vendedor") return [{ grupo: "Painéis", itens: [{ href: "/meu-painel", rotulo: "Resumo pessoal" }] }];
  const grupos: GrupoBarra[] = [
    { grupo: "Painéis", itens: ABAS.map((a) => ({ href: `/${a.id}`, rotulo: a.rotulo })) },
    { grupo: "Equipe", itens: [{ href: "/produtores", rotulo: "Produtores" }] },
    { grupo: "Exibição", itens: [{ href: "/apresentacao", rotulo: "Apresentação" }, { href: HREF_EXIBICAO_TV, rotulo: "Exibição TV" }] },
  ];
  if (role === "admin") grupos.push({ grupo: "Admin", itens: [{ href: "/admin/usuarios", rotulo: "Usuários e vínculos" }] });
  return grupos;
}

const ativo = (rota: string, href: string) => rota === href || rota.startsWith(href + "/");

/** Navegação principal (substitui as abas do topo). Sem usuário (/api/eu falhou) mostra a lista de
 *  gestão, sem o pé e sem Admin; com base.semAcesso o escopo é de vendedor. Enquanto carrega, só a marca. */
export function BarraLateral({ usuario, carregando = false, base, recolhida = false, aoAlternarRecolhida }: {
  usuario: Usuario | null; carregando?: boolean; base: BaseCliente;
  /** Só ícones (o nome vai no title). O botão « / » aparece quando há aoAlternarRecolhida. */
  recolhida?: boolean; aoAlternarRecolhida?: () => void;
}) {
  const rota = usePathname();
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const role: Papel | null = usuario?.role ?? (base.semAcesso ? "vendedor" : carregando ? null : "gestao");
  const grupos = role ? itensDaBarra(role) : [];

  // As abas levam o ?f= dos filtros junto (como as abas do topo faziam); clique com modificador abre normal.
  const irPara = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    setAberta(false);
    if (!ROTAS_ABAS.has(href) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`${href}${window.location.search}`);
  };

  return (
    <aside className={`${s.barra}${aberta ? ` ${s.aberta}` : ""}${recolhida ? ` ${s.recolhida}` : ""}`} data-recolhida={recolhida}>
      <div className={s.topoEstreito}>
        <button type="button" className={s.hamburguer} aria-label="Abrir menu" aria-expanded={aberta} aria-controls="barra-lateral-nav"
          onClick={() => setAberta((v) => !v)}>☰</button>
      </div>
      {aberta && <div className={s.veu} onClick={() => setAberta(false)} aria-hidden="true" />}
      <nav id="barra-lateral-nav" className={s.nav} aria-label="Navegação principal">
        <div className={s.topoNav}>
          <div className={s.marca}><small>Santolin</small><span className={s.texto}>Dashboard</span></div>
          {aoAlternarRecolhida && (
            <button type="button" className={s.recolher} aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              title={recolhida ? "Expandir menu" : "Recolher menu"} onClick={aoAlternarRecolhida}>{recolhida ? "»" : "«"}</button>
          )}
        </div>
        {grupos.map((g) => (
          <div key={g.grupo} className={s.grupo}>
            <div className={s.rotuloGrupo}>{g.grupo}</div>
            {g.itens.map((i) => i.href === HREF_EXIBICAO_TV ? (
              <MenuExibicaoTv key={i.href} temDados={base.linhas.length > 0} ir={router.push} prefixoId="barra-"
                classeMenu={s.menuTv} classeBotao={s.item} classeLista={s.listaTv}
                rotulo={<><span className={s.icone} aria-hidden="true">{ICONES[i.href]}</span><span className={s.texto}>{i.rotulo}</span></>} />
            ) : (
              <Link key={i.href} href={i.href} onClick={(e) => irPara(e, i.href)}
                className={`${s.item}${ativo(rota, i.href) ? ` ${s.ativo} ativo` : ""}`}
                aria-current={ativo(rota, i.href) ? "page" : undefined} title={recolhida ? i.rotulo : undefined}>
                <span className={s.icone} aria-hidden="true">{ICONES[i.href]}</span><span className={s.texto}>{i.rotulo}</span>
              </Link>
            ))}
          </div>
        ))}
        {usuario && (
          <div className={s.pe}>
            <b>{usuario.nome}</b>
            <span>{ROTULO_PAPEL[usuario.role]}</span>
            {" · "}
            <button type="button" className={s.sair} onClick={() => void signOut({ callbackUrl: "/entrar" })}>Sair</button>
          </div>
        )}
      </nav>
    </aside>
  );
}
