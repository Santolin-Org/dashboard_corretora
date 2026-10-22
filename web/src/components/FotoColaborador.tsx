import s from "./FotoColaborador.module.css";

/** Iniciais do primeiro e do último nome ("Victor Augusto Lima" → "VL"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (!partes.length) return "";
  const primeira = partes[0][0];
  return (partes.length > 1 ? primeira + partes[partes.length - 1][0] : primeira).toUpperCase();
}

// Foto redonda do colaborador; sem foto cadastrada, um placeholder com as iniciais.
export function FotoColaborador({ colab, url }: { colab: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- foto de origem externa ao build (cadastro do usuário)
    return <img className={s.foto} src={url} alt={`Foto de ${colab}`} data-foto="imagem" />;
  }
  return (
    <span className={`${s.foto} ${s.placeholder}`} data-foto="placeholder" role="img" aria-label={`Foto de ${colab} (ainda não cadastrada)`}>
      {iniciais(colab)}
    </span>
  );
}
