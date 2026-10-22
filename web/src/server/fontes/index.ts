import { GraphFonte } from "./graph";
import { PastaLocalFonte } from "./pasta-local";
import { ErroFonte, type FonteArquivos } from "./tipos";

export * from "./tipos";

/** FONTE=local → PastaLocalFonte(FONTE_DIR); senão GraphFonte (credenciais AZURE_*). */
export function criarFonte(): FonteArquivos {
  if (process.env.FONTE === "local") {
    const dir = process.env.FONTE_DIR;
    if (!dir) throw new ErroFonte("pasta", "FONTE=local exige FONTE_DIR");
    return new PastaLocalFonte(dir);
  }
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new ErroFonte("auth", "Credenciais do Azure ausentes (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)");
  }
  return new GraphFonte({ tenantId: AZURE_TENANT_ID, clientId: AZURE_CLIENT_ID, clientSecret: AZURE_CLIENT_SECRET });
}
