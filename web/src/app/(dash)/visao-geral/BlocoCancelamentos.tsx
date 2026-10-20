"use client";
import { useMemo, useState } from "react";
import type { Linha } from "@/domain/tipos";
import { alternarMotivo, cancelamentos } from "@/domain/visao-geral";
import { fN } from "@/domain/formatos";
import { Grafico } from "@/components/Grafico";
import { axisClr, gridClr, labelClr } from "@/client/tema";
import { idObjeto } from "@/client/versao";
import s from "./VisaoGeral.module.css";

// Cancelamentos por motivo + filtro de motivos (buildCancelFilter/cancelCbToggle/cancelCbAll/cancelCbNone).
// `activeCancelMotivos` do app antigo só é usado aqui, então vive neste componente (não é global entre
// abas). null = todos marcados. Volta a null sempre que o FD muda (applyFilters/resetFilters).
export function BlocoCancelamentos({ fd }: { fd: Linha[] }) {
  const [estado, setEstado] = useState<{ fd: Linha[]; sel: ReadonlySet<string> | null }>({ fd, sel: null });
  const sel = estado.fd === fd ? estado.sel : null;
  const definirSel = (novo: ReadonlySet<string> | null) => setEstado({ fd, sel: novo });
  const [aberto, setAberto] = useState(false); // toggleCancelFilter: lista começa fechada

  const cn = useMemo(() => cancelamentos(fd, sel), [fd, sel]);
  const nomes = cn.todos.map(([m]) => m);
  const total = nomes.length;
  const marcados = sel ? sel.size : total;

  return (
    <div className="chart-card span2">
      <div className="chart-top">
        <span className="chart-title">Cancelamentos por motivo</span>
        {" "}
        <span className="chart-badge" id="cancel-badge">{fN(cn.filtradas) + " cancelamentos"}</span>
      </div>
      {" "}
      <div className={`${s.cancelFilter} cancel-filter`} id="cancel-filter">
        <div className={`${s.cancelFilterHeader} cancel-filter-header`} onClick={() => setAberto((a) => !a)}>
          <span className={`${s.cancelFilterTitle} cancel-filter-title`}>Filtrar motivos{" "}
            <span id="cancel-filter-count" className={s.contagem}>{marcados === total ? "todos" : marcados + " de " + total}</span>
          </span>{" "}
          {" "}
          <span className={`${s.cancelFilterArrow} cancel-filter-arrow${aberto ? ` ${s.open} open` : ""}`} id="cancel-filter-arrow">▼</span>
        </div>
        {" "}
        <div className={`${s.cancelCbList} cancel-cb-list${aberto ? ` ${s.open} open` : ""}`} id="cancel-cb-list">
          {cn.todos.map(([m, n], i) => {
            const id = "cb-" + m.replace(/\W/g, "_").slice(0, 30);
            return (
              <div key={i} className={`${s.cancelCbItem} cancel-cb-item`}>
                <input type="checkbox" id={id} checked={!sel || sel.has(m)} onChange={(e) => definirSel(alternarMotivo(sel, nomes, m, e.target.checked))} />
                <label htmlFor={id}>{m}</label>
                <span className={`${s.cbCount} cb-count`}>{n}</span>
              </div>
            );
          })}
        </div>
        {" "}
        <div className={`${s.cancelFilterFooter} cancel-filter-footer`}>
          <button type="button" onClick={() => definirSel(null)}>Marcar todos</button>
          {" "}
          <button type="button" onClick={() => definirSel(new Set())}>Desmarcar todos</button>
        </div>
      </div>
      {" "}
      <div className="cw" id="cancel-wrap" style={{ height: cn.alturaPx }}>
        {cn.valores.length ? (
          <Grafico
            id="ch-cancel" chave={idObjeto(cn)}
            construir={() => {
              const ac = axisClr(), lc = labelClr(), gc = gridClr();
              return {
                type: "bar",
                data: {
                  labels: cn.rotulos,
                  datasets: [{ data: cn.valores, backgroundColor: cn.valores.map((_, i) => i === 0 ? "rgba(226,75,74,.85)" : i <= 2 ? "rgba(226,75,74,.6)" : "rgba(226,75,74,.4)"), borderRadius: 4 }],
                },
                options: {
                  indexAxis: "y", responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.raw + " apólices" } } },
                  scales: { x: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } },
                },
              };
            }}
          />
        ) : <canvas id="ch-cancel" /> /* sem dados: o antigo destrói o gráfico e deixa o canvas, com 60px */}
      </div>
    </div>
  );
}
