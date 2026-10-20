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
