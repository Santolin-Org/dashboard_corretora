"use client";
import { useEffect, useMemo, useState } from "react";
import { usePainel } from "@/client/painel";
import { nomesDistintos } from "@/domain/painel-produtor";
import { PainelProdutor } from "@/components/painel-produtor/PainelProdutor";
import { SeletorProdutores, opcoesSeletor } from "@/components/painel-produtor/SeletorProdutores";
import s from "@/components/painel-produtor/SeletorProdutores.module.css";

const CHAVE = "produtores:selecao";
type Lista = { produtores: { nome: string; nomes: string[] }[]; ignorados: string[] };

function lerSelecao(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function gravarSelecao(ids: Set<string>) {
  try { localStorage.setItem(CHAVE, JSON.stringify([...ids])); } catch { /* sem armazenamento: segue sem lembrar */ }
}

/** Produtores (admin/gestão): o painel do produtor para um ou mais nomes escolhidos. */
export default function Produtores() {
  const { base } = usePainel();
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/produtores", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: Lista) => { if (vivo) setLista(c); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [tentativa]);

  const opcoes = useMemo(
    () => (lista ? opcoesSeletor(lista.produtores, nomesDistintos(base.linhas), lista.ignorados) : null),
    [lista, base.linhas],
  );

  // Seleção lembrada (lida uma vez, só no cliente: a página não renderiza nada antes da lista); ids que não existem mais são descartados.
  const [lembrados, setLembrados] = useState<Set<string>>(() => new Set(lerSelecao()));
  const sel = useMemo(() => {
    if (!opcoes) return lembrados;
    const validos = new Set([...opcoes.pessoas, ...opcoes.semDono].map((o) => o.id));
    return new Set([...lembrados].filter((id) => validos.has(id)));
  }, [opcoes, lembrados]);
  useEffect(() => { if (opcoes) gravarSelecao(sel); }, [opcoes, sel]);

  const mudar = setLembrados;

  const nomes = useMemo(() => {
    const n = new Set<string>();
    if (opcoes) for (const o of [...opcoes.pessoas, ...opcoes.semDono]) if (sel.has(o.id)) o.nomes.forEach((x) => n.add(x));
    return n;
  }, [opcoes, sel]);

  if (erro) {
    return (
      <div className={s.msg} role="alert">
        Não foi possível carregar a lista de produtores.
        <button type="button" onClick={() => { setErro(false); setTentativa((t) => t + 1); }}>Tentar novamente</button>
      </div>
    );
  }
  if (!opcoes) return null; // a casca já está na tela
  return (
    <>
      <div className={s.barra}>
        <b>Produtores<small>O mesmo painel que o produtor vê</small></b>
        <SeletorProdutores opcoes={opcoes} selecionados={sel} aoMudar={mudar} />
      </div>
      {nomes.size === 0
        ? <p className={s.msg}>Escolha um ou mais produtores.</p>
        : <PainelProdutor nomes={nomes} mostrarDono={nomes.size > 1} saudacao={null} prefixoTitulo="Produção" />}
    </>
  );
}
