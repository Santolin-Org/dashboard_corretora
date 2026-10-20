import { promises as fs } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { del, get, list, put } from "@vercel/blob";
import type { Linha } from "@/domain/tipos";

export interface ArmazemSnapshots {
  ler(chave: string): Promise<Uint8Array | null>;
  gravar(chave: string, dados: Uint8Array): Promise<void>;
  apagarTudo(): Promise<void>;
  /** Chaves com o prefixo dado. */
  listar(prefixo: string): Promise<string[]>;
  apagar(chaves: string[]): Promise<void>;
}

/** Linha[] → JSON → gzip. */
export function codificarLinhas(linhas: Linha[]): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(JSON.stringify(linhas), "utf8")));
}

/** Inverso de codificarLinhas; lança se o conteúdo estiver corrompido. */
export function decodificarLinhas(dados: Uint8Array): Linha[] {
  const v = JSON.parse(gunzipSync(dados).toString("utf8"));
  if (!Array.isArray(v)) throw new Error("snapshot inválido");
  return v as Linha[];
}

/** Armazém em memória (testes). */
export function criarArmazemMemoria(): ArmazemSnapshots & { chaves(): string[] } {
  const m = new Map<string, Uint8Array>();
  return {
    async ler(c) {
      return m.get(c) ?? null;
    },
    async gravar(c, d) {
      m.set(c, d);
    },
    async apagarTudo() {
      m.clear();
    },
    async listar(p) {
      return [...m.keys()].filter((k) => k.startsWith(p));
    },
    async apagar(ks) {
      for (const k of ks) m.delete(k);
    },
    chaves: () => [...m.keys()],
  };
}

/** Diretório local; a chave vira um nome de arquivo seguro. */
export function criarArmazemLocal(dir: string): ArmazemSnapshots {
  const arq = (c: string) => join(dir, encodeURIComponent(c));
  return {
    async ler(c) {
      try {
        return new Uint8Array(await fs.readFile(arq(c)));
      } catch {
        return null;
      }
    },
    async gravar(c, d) {
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${arq(c)}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, d);
      await fs.rename(tmp, arq(c)); // gravação atômica
    },
    async apagarTudo() {
      await fs.rm(dir, { recursive: true, force: true });
    },
    async listar(p) {
      try {
        return (await fs.readdir(dir)).filter((n) => !n.endsWith(".tmp")).map(decodeURIComponent).filter((k) => k.startsWith(p));
      } catch {
        return [];
      }
    },
    async apagar(ks) {
      await Promise.all(ks.map((k) => fs.rm(arq(k), { force: true })));
    },
  };
}

const PREFIXO_BLOB = "snapshots/";

/** Vercel Blob privado (BLOB_READ_WRITE_TOKEN). */
export function criarArmazemBlob(): ArmazemSnapshots {
  const caminho = (c: string) => PREFIXO_BLOB + encodeURIComponent(c);
  return {
    async ler(c) {
      const r = await get(caminho(c), { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return new Uint8Array(await new Response(r.stream).arrayBuffer());
    },
    async gravar(c, d) {
      await put(caminho(c), Buffer.from(d), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/gzip",
      });
    },
    async apagarTudo() {
      let cursor: string | undefined;
      do {
        const r = await list({ prefix: PREFIXO_BLOB, cursor, limit: 1000 });
        if (r.blobs.length) await del(r.blobs.map((b) => b.url));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
    },
    async listar(p) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const r = await list({ prefix: caminho(p), cursor, limit: 1000 });
        for (const b of r.blobs) out.push(decodeURIComponent(b.pathname.slice(PREFIXO_BLOB.length)));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
    async apagar(ks) {
      if (ks.length) await del(ks.map(caminho));
    },
  };
}

/** Vercel Blob quando há BLOB_READ_WRITE_TOKEN; senão .snapshots/ local. */
export function criarArmazem(): ArmazemSnapshots {
  if (process.env.BLOB_READ_WRITE_TOKEN) return criarArmazemBlob();
  return criarArmazemLocal(join(process.cwd(), ".snapshots"));
}
