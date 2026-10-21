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
