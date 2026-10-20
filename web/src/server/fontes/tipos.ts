import { GraphFonte } from "./graph";
import { PastaLocalFonte } from "./pasta-local";

export type ArquivoMeta = { id: string; nome: string; tag: string /* cTag ou eTag */; modificadoEm: string };

export interface FonteArquivos {
  /** Tudo da pasta Dashboard (produção, sinistros, saúde). */
  listar(): Promise<ArquivoMeta[]>;
  baixar(a: ArquivoMeta): Promise<ArrayBuffer>;
}

export type CodigoErroFonte = "auth" | "pasta" | "rede" | "http";

export class ErroFonte extends Error {
  codigo: CodigoErroFonte;
  status?: number;
  constructor(codigo: CodigoErroFonte, mensagem: string, status?: number) {
    super(mensagem);
    this.name = "ErroFonte";
    this.codigo = codigo;
    this.status = status;
  }
}

const normNome = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Nome normalizado (minúsculas, sem acento) casando ^producao.*\.xlsx?$, ignorando "~$". */
export function isProducaoFileName(nome: string): boolean {
  return /^producao.*\.xlsx?$/.test(normNome(nome)) && !String(nome).startsWith("~$");
}

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
