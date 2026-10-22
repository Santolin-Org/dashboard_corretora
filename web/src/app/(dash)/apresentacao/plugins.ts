import type { Plugin } from "chart.js";
import { fBRL, fShort } from "@/domain/formatos";

type Elemento = { x: number; y: number; base: number };

/** kfBarLabelPlugin: escreve o valor (R$) na ponta de cada barra horizontal (dentro, se couber; senão, fora). */
export const kfBarLabelPlugin: Plugin<"bar"> = {
  id: "kfBarLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el0, i) => {
        const el = el0 as unknown as Elemento;
        const v = ds.data[i] as number | null | undefined;
        if (v == null) return;
        const txt = fBRL(v);
        const tw = ctx.measureText(txt).width;
        const barLen = Math.abs(el.x - el.base);
        if (barLen > tw + 20) {
          ctx.textAlign = "right";
          ctx.fillStyle = di === 0 ? "#3a2c05" : "#ffffff";
          ctx.fillText(txt, el.x - 10, el.y);
        } else {
          ctx.textAlign = "left";
          ctx.fillStyle = "#2B2733";
          ctx.fillText(txt, el.x + 10, el.y);
        }
      });
    });
    ctx.restore();
  },
};

/** kfWeeksLabelPlugin: valor (R$ curto) acima de cada barra vertical do gráfico semanal. */
export const kfWeeksLabelPlugin: Plugin<"bar"> = {
  id: "kfWeeksLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "center";
    ctx.fillStyle = "#2B2733";
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el0, i) => {
        const el = el0 as unknown as Elemento;
        const v = ds.data[i] as number | null | undefined;
        if (v == null || v === 0) return;
        ctx.fillText(fShort(v), el.x, el.y - 3);
      });
    });
    ctx.restore();
  },
};
