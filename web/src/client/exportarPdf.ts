"use client";

/**
 * exportCompPivotPdf (main.js ~3323): captura o elemento com html2canvas e grava uma página do tamanho da imagem
 * no jsPDF. As duas bibliotecas só são carregadas (import dinâmico) quando o usuário clica em exportar.
 * Orientação: paisagem quando a imagem é mais larga que alta.
 */
export async function exportarElementoPdf(el: HTMLElement, arquivo: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(el, {
    scale: 2, backgroundColor: "#0b0f18", useCORS: true,
    width: el.scrollWidth, height: el.scrollHeight,
    windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
  });
  const imgW = canvas.width, imgH = canvas.height;
  const pdf = new jsPDF({ orientation: imgW >= imgH ? "landscape" : "portrait", unit: "px", format: [imgW, imgH] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgW, imgH);
  pdf.save(arquivo);
}

/**
 * exportKickoffPdf (main.js ~4391): PDF paisagem 16:9 (1280×720 px), uma página por slide. Para cada slide `mostrar(i)` põe
 * o slide na tela (e espera o gráfico desenhar) e devolve o elemento a capturar (null: o slide é pulado, como no antigo).
 * As animações do Chart.js ficam desligadas durante a captura. html2canvas/jsPDF só são carregados (import dinâmico) aqui.
 * Lança Error("bibliotecas") se as bibliotecas não carregarem.
 */
export async function exportarSlidesPdf(o: {
  total: number;
  mostrar: (i: number) => Promise<HTMLElement | null>;
  arquivo: string;
  progresso?: (feitos: number, total: number) => void;
}): Promise<void> {
  let html2canvas: typeof import("html2canvas").default, jsPDF: typeof import("jspdf").jsPDF;
  try {
    [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  } catch {
    throw new Error("bibliotecas");
  }
  const { default: ChartJs } = await import("chart.js/auto");
  const animacao = ChartJs.defaults.animation;
  ChartJs.defaults.animation = false; // captura os gráficos já completos
  try {
    const W = 1280, H = 720; // página 16:9
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H] });
    for (let i = 0; i < o.total; i++) {
      o.progresso?.(i + 1, o.total);
      const page = await o.mostrar(i);
      if (!page) continue;
      const canvas = await html2canvas(page, {
        scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true,
        onclone: (doc) => {
          // No clone, a animação de entrada (kf-in) recomeça e o html2canvas capturaria o slide em opacity:0 / deslocado.
          doc.querySelectorAll<HTMLElement>(".kf-page").forEach((el) => {
            el.style.animation = "none"; el.style.opacity = "1"; el.style.transform = "none";
          });
        },
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage([W, H], "landscape");
      pdf.addImage(img, "JPEG", 0, 0, W, H);
    }
    pdf.save(o.arquivo);
  } finally {
    ChartJs.defaults.animation = animacao;
  }
}
