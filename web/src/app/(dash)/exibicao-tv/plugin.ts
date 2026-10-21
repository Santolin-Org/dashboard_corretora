import type { Plugin } from "chart.js";
import { fN } from "@/domain/formatos";
import { fVarPct } from "@/domain/exibicao-tv";
import { labelClr, negClr, posClr } from "@/client/tema";

// Rótulo com o valor acima de cada barra do dataset indicado (só a barra, não
// a linha de tendência sobreposta — senão o rótulo desenharia duas vezes).
//
// Com opts.variacao, escreve mais acima a variação em relação à barra anterior,
// verde pra cima e vermelho pra baixo. É opcional porque só faz sentido quando as
// barras formam uma série temporal: em "Clientes por nível" o eixo são faixas, e
// comparar o nível 2 com o nível 1 não significaria nada.
// A primeira barra não tem com o que comparar e fica sem o rótulo, assim como a
// que vem depois de um ano zerado (não há base para o percentual).
export function tvBarValueLabelPlugin(datasetIndex: number, opts?: { variacao?: boolean }): Plugin {
  const variacao = !!(opts && opts.variacao);
  return {
    id: "tvBarValueLabel",
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.textBaseline = "bottom";
      ctx.textAlign = "center";
      const ds = chart.data.datasets[datasetIndex];
      meta.data.forEach((el, i) => {
        const v = ds.data[i] as number | null | undefined;
        if (v == null) return;
        ctx.font = "700 12px Inter, system-ui, sans-serif";
        ctx.fillStyle = labelClr();
        ctx.fillText(fN(v), el.x, el.y - 6);
        if (!variacao || i === 0) return;
        const prev = ds.data[i - 1] as number | null | undefined;
        if (prev == null || prev === 0) return;
        const pct = (v - prev) / prev;
        ctx.font = "700 11px Inter, system-ui, sans-serif";
        ctx.fillStyle = pct >= 0 ? posClr() : negClr();
        ctx.fillText(fVarPct(pct), el.x, el.y - 22);
      });
      ctx.restore();
    },
  };
}
