// Faixa no topo fora da produção (ex.: dev-bi.santolinseguros.com.br, branch `dev`): deixa claro que não é o painel
// oficial. `ambiente` vem de NEXT_PUBLIC_VERCEL_ENV (a Vercel expõe as variáveis de sistema no build).
export function AvisoAmbiente({ ambiente }: { ambiente: string | undefined }) {
  if (ambiente !== "preview") return null;
  return (
    <div role="status" style={{ background: "#7c2d12", color: "#fff7ed", fontSize: 12, fontWeight: 600, textAlign: "center", padding: "4px 8px" }}>
      Ambiente de desenvolvimento — não é o painel oficial; atribuições e cadastros feitos aqui não valem na produção.
    </div>
  );
}
