import { promises as fs } from "node:fs";
import { join } from "node:path";
import { ErroFonte, type ArquivoMeta, type FonteArquivos } from "./tipos";

/** Lê uma pasta local (dev e paridade). tag = mtime+size; modificadoEm = mtime ISO. */
export class PastaLocalFonte implements FonteArquivos {
  constructor(private readonly dir: string) {}

  async listar(): Promise<ArquivoMeta[]> {
    let entradas;
    try {
      entradas = await fs.readdir(this.dir, { withFileTypes: true });
    } catch {
      throw new ErroFonte("pasta", `Pasta local não encontrada: ${this.dir}`);
    }
    const metas: ArquivoMeta[] = [];
    for (const e of entradas) {
      if (!e.isFile()) continue;
      const st = await fs.stat(join(this.dir, e.name));
      metas.push({
        id: e.name,
        nome: e.name,
        tag: `${st.mtimeMs}-${st.size}`,
        modificadoEm: st.mtime.toISOString(),
      });
    }
    return metas.sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async baixar(a: ArquivoMeta): Promise<ArrayBuffer> {
    const b = await fs.readFile(join(this.dir, a.id));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
}
