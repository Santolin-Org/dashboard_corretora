"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePainel } from "@/client/painel";
import { nomesDistintos } from "@/domain/painel-produtor";
import type { Papel } from "@/server/db/schema";
import s from "./UsuariosVinculos.module.css";

type Usuario = { id: number; email: string; nome: string; role: Papel; ativo: boolean; nomes: string[] };
type Dados = { usuarios: Usuario[]; ignorados: string[] };
type Form = { id?: number; email: string; nome: string; role: Papel; ativo: boolean };
type Menu = { tipo: "nome"; userId: number } | { tipo: "dono"; nome: string };

const ROTULO: Record<Papel, string> = { admin: "admin", gestao: "gestão", vendedor: "vendedor" };
const SELO: Record<Papel, string> = { admin: s.pa, gestao: s.pg, vendedor: s.pv };
const PAPEIS: Papel[] = ["admin", "gestao", "vendedor"];
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const qtdFmt = new Intl.NumberFormat("pt-BR");

/** Envia a escrita e devolve a mensagem de erro (do servidor, como veio) ou null se deu certo. */
async function enviar(url: string, metodo: "POST" | "PUT", corpo: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, {
      method: metodo, credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    });
    if (r.ok) return null;
    const c = (await r.json().catch(() => null)) as { erro?: string } | null;
    return c?.erro ?? "Não foi possível salvar.";
  } catch { return "Não foi possível salvar."; }
}

async function buscar(): Promise<Dados | null> {
  try {
    const r = await fetch("/api/admin/usuarios", { credentials: "same-origin" });
    return r.ok ? ((await r.json()) as Dados) : null;
  } catch { return null; }
}

/** Tela do admin: logins, papéis, nomes da planilha de cada um e nomes sem dono. */
export function UsuariosVinculos() {
  const { base } = usePainel();
  const [dados, setDados] = useState<Dados | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregar = useCallback(async (): Promise<boolean> => {
    const novos = await buscar();
    setFalhou(!novos);
    if (novos) setDados(novos);
    return !!novos;
  }, []);
  useEffect(() => {
    let vivo = true;
    void buscar().then((novos) => { if (!vivo) return; setFalhou(!novos); if (novos) setDados(novos); });
    return () => { vivo = false; };
  }, []);

  const semDono = useMemo(() => {
    if (!dados) return [];
    const usados = new Set([...dados.usuarios.flatMap((u) => u.nomes), ...dados.ignorados]);
    return nomesDistintos(base.linhas).filter((n) => !usados.has(n.nome));
  }, [dados, base.linhas]);

  /** Roda uma escrita; trava os botões enquanto espera; recarrega a lista se deu certo. */
  const agir = async (url: string, metodo: "POST" | "PUT", corpo: unknown): Promise<string | null> => {
    setOcupado(true);
    const erro = await enviar(url, metodo, corpo);
    if (!erro) await carregar();
    setOcupado(false);
    return erro;
  };
  const acao = async (url: string, corpo: unknown) => {
    setAviso(null); setMenu(null); setBusca("");
    const erro = await agir(url, "PUT", corpo);
    if (erro) setAviso(erro);
  };
  const vincular = (nome: string, userId: number | null) => acao("/api/admin/vinculos", { nome, userId });
  const desvincular = (nome: string) => { if (confirm(`Desvincular ${nome}?`)) void vincular(nome, null); };
  const ignorar = (nome: string, ignorar: boolean) => acao("/api/admin/ignorados", { nome, ignorar });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErroForm(null);
    const corpo = { ...(form.id !== undefined ? { id: form.id } : {}), email: form.email.trim(), nome: form.nome.trim(), role: form.role, ativo: form.ativo };
    const erro = await agir("/api/admin/usuarios", "POST", corpo);
    if (erro) setErroForm(erro); else setForm(null);
  };

  if (falhou && !dados) {
    return (
      <div className={s.msg} role="alert">
        Não foi possível carregar os usuários.
        <button type="button" onClick={() => void carregar()}>Tentar novamente</button>
      </div>
    );
  }
  if (!dados) return null;

  const ativos = dados.usuarios.filter((u) => u.ativo);
  const achados = semDono.filter((n) => norm(n.nome).includes(norm(busca.trim())));
  const abrirMenu = (m: Menu) => { setMenu(m); setBusca(""); };

  return (
    <div className={s.pagina}>
      <div className={s.topo}>
        <b>Usuários e vínculos<small>Quem entra, com qual papel, e quais nomes da planilha são de cada um</small></b>
        <button type="button" className={s.btn} disabled={ocupado}
          onClick={() => { setErroForm(null); setForm({ email: "", nome: "", role: "vendedor", ativo: true }); }}>+ Novo usuário</button>
      </div>
      {aviso && <p className={s.erro} role="alert">{aviso}</p>}
      {falhou && <p className={s.erro} role="alert">Não foi possível atualizar a lista.</p>}

      {form && (
        <form className={s.form} aria-label="Usuário" onSubmit={salvar}>
          <label>E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Nome<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label>Papel
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Papel })}>
              {PAPEIS.map((p) => <option key={p} value={p}>{ROTULO[p]}</option>)}
            </select>
          </label>
          <label className={s.ativo}><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Ativo</label>
          {erroForm && <p className={s.erro} role="alert">{erroForm}</p>}
          <div className={s.acoes}>
            <button type="submit" className={s.btn} disabled={ocupado}>Salvar</button>
            <button type="button" disabled={ocupado} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className={s.grade}>
        <div className={s.card}>
          <table>
            <thead><tr><th>Login</th><th>Papel</th><th>Nomes na planilha (coluna COLABORADOR)</th><th /></tr></thead>
            <tbody>
              {dados.usuarios.map((u) => (
                <tr key={u.id} className={u.ativo ? undefined : s.inativo}>
                  <td>{u.nome}<small>{u.email}</small></td>
                  <td>
                    <span className={`${s.papel} ${SELO[u.role]}`}>{ROTULO[u.role]}</span>
                    {!u.ativo && <span className={s.papel}>inativo</span>}
                  </td>
                  <td>
                    {u.nomes.length === 0 && u.role === "vendedor" && <span className={s.vazio}>⚠ sem vínculo — vê o painel vazio</span>}
                    {u.nomes.map((n) => (
                      <span key={n} className={s.chip}>{n}
                        <button type="button" aria-label={`Desvincular ${n}`} disabled={ocupado} onClick={() => desvincular(n)}>×</button>
                      </span>
                    ))}
                    <span className={s.ancora}>
                      <button type="button" className={s.add} disabled={ocupado} onClick={() => abrirMenu({ tipo: "nome", userId: u.id })}>+ nome</button>
                      {menu?.tipo === "nome" && menu.userId === u.id && (
                        <div className={s.menu}>
                          <input aria-label="Buscar nome" placeholder="Buscar nome…" value={busca} autoFocus onChange={(e) => setBusca(e.target.value)} />
                          <ul>
                            {achados.map((n) => (
                              <li key={n.nome}><button type="button" disabled={ocupado} onClick={() => void vincular(n.nome, u.id)}>{n.nome}</button></li>
                            ))}
                            {achados.length === 0 && <li className={s.nada}>Nenhum nome sem dono</li>}
                          </ul>
                        </div>
                      )}
                    </span>
                  </td>
                  <td><button type="button" disabled={ocupado} onClick={() => { setErroForm(null); setForm({ id: u.id, email: u.email, nome: u.nome, role: u.role, ativo: u.ativo }); }}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className={`${s.card} ${s.lado}`}>
          <h4>Nomes sem dono · {semDono.length}</h4>
          <p>Nomes da planilha que nenhum login tem. Clique para vincular, ou marque como &quot;não é pessoa&quot;.</p>
          <ul>
            {semDono.map((n) => (
              <li key={n.nome}>
                <button type="button" className={s.nome} disabled={ocupado} onClick={() => abrirMenu({ tipo: "dono", nome: n.nome })}>{n.nome}</button>
                <span>{qtdFmt.format(n.qtd)}</span>
                <button type="button" className={s.sec} aria-label={`Não é pessoa: ${n.nome}`} disabled={ocupado} onClick={() => void ignorar(n.nome, true)}>não é pessoa</button>
                {menu?.tipo === "dono" && menu.nome === n.nome && (
                  <ul className={s.menu}>
                    {ativos.map((u) => <li key={u.id}><button type="button" disabled={ocupado} onClick={() => void vincular(n.nome, u.id)}>{u.nome}</button></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {dados.ignorados.length > 0 && (
            <details>
              <summary>Marcados como não é pessoa · {dados.ignorados.length}</summary>
              <ul>
                {dados.ignorados.map((n) => (
                  <li key={n} className={s.ign}>
                    <span>{n}</span>
                    <button type="button" className={s.sec} aria-label={`Desfazer: ${n}`} disabled={ocupado} onClick={() => void ignorar(n, false)}>desfazer</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
