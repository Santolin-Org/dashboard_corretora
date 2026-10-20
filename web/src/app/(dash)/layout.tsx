import { Suspense, type ReactNode } from "react";
import { Casca } from "@/components/Casca";
import { TelaCarregando } from "@/components/TelaErro";

// Toda navegação para o painel espera /api/dados no cliente (tela "Processando..."), então
// não há UI instantânea a validar.
export const instant = false;

// Tudo do painel roda no cliente (dados de /api/dados); o Suspense cobre o useSearchParams
// dos filtros (?f=) para o restante do layout poder ser pré-renderizado.
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<TelaCarregando />}>
      <Casca>{children}</Casca>
    </Suspense>
  );
}
