import { ErroFonte, type ArquivoMeta, type FonteArquivos } from "./tipos";

const GRAPH = "https://graph.microsoft.com/v1.0";
const HOST = "santolinseguros.sharepoint.com";
const BIBLIOTECA = "Santolin";
const PASTA = "Dashboard";
const MARGEM_TOKEN_MS = 60_000;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type GraphOpcoes = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fetch?: FetchFn;
};

type ItemGraph = {
  id: string;
  name: string;
  size?: number;
  folder?: unknown;
  eTag?: string;
  cTag?: string;
  lastModifiedDateTime?: string;
};

/** Lê /Santolin/Dashboard do SharePoint com credencial de aplicativo (Sites.Selected, leitura). */
export class GraphFonte implements FonteArquivos {
  private readonly f: FetchFn;
  private token: { valor: string; expiraEm: number } | null = null;
  private driveId: string | null = null;

  constructor(private readonly o: GraphOpcoes) {
    this.f = o.fetch ?? ((url, init) => fetch(url, init));
  }

  private async req(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.f(url, init);
    } catch {
      throw new ErroFonte("rede", "Falha de rede ao acessar o Microsoft Graph");
    }
  }

  private async obterToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiraEm - MARGEM_TOKEN_MS) return this.token.valor;
    const corpo = new URLSearchParams({
      client_id: this.o.clientId,
      client_secret: this.o.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const r = await this.req(`https://login.microsoftonline.com/${this.o.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    });
    if (r.status === 400 || r.status === 401) throw new ErroFonte("auth", "Credenciais do aplicativo recusadas pelo Azure AD", r.status);
    if (!r.ok) throw new ErroFonte("http", `Token: HTTP ${r.status}`, r.status);
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new ErroFonte("auth", "Resposta de token sem access_token");
    this.token = { valor: j.access_token, expiraEm: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return this.token.valor;
  }

  private async get(url: string, recurso: "site" | "pasta" | "arquivo"): Promise<Response> {
    const token = await this.obterToken();
    const r = await this.req(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r;
    if (r.status === 401 || r.status === 403) throw new ErroFonte("auth", `Graph recusou o acesso (HTTP ${r.status})`, r.status);
    if (r.status === 404) throw new ErroFonte("pasta", `Não encontrado no SharePoint (${recurso})`, 404);
    throw new ErroFonte("http", `Graph: HTTP ${r.status}`, r.status);
  }

  private async obterDriveId(): Promise<string> {
    if (this.driveId) return this.driveId;
    const site = (await (await this.get(`${GRAPH}/sites/${HOST}`, "site")).json()) as { id: string };
    const { value: drives = [] } = (await (await this.get(`${GRAPH}/sites/${site.id}/drives`, "site")).json()) as {
      value?: { id: string; name: string }[];
    };
    const d = drives.find((x) => x.name.toLowerCase() === BIBLIOTECA.toLowerCase());
    if (!d) throw new ErroFonte("pasta", `Biblioteca "${BIBLIOTECA}" não encontrada`);
    this.driveId = d.id;
    return d.id;
  }

  async listar(): Promise<ArquivoMeta[]> {
    const drive = await this.obterDriveId();
    let url: string | undefined =
      `${GRAPH}/drives/${drive}/root:/${PASTA}:/children` +
      `?$select=id,name,size,file,folder,eTag,cTag,lastModifiedDateTime&$top=200`;
    const itens: ItemGraph[] = [];
    while (url) {
      const j = (await (await this.get(url, "pasta")).json()) as { value?: ItemGraph[]; "@odata.nextLink"?: string };
      for (const it of j.value ?? []) itens.push(it);
      url = j["@odata.nextLink"];
    }
    return itens
      .filter((i) => !i.folder)
      .map((i) => ({
        id: i.id,
        nome: i.name,
        tag: i.cTag || i.eTag || String(i.size ?? ""),
        modificadoEm: i.lastModifiedDateTime ?? "",
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async baixar(a: ArquivoMeta): Promise<ArrayBuffer> {
    const drive = await this.obterDriveId();
    const r = await this.get(`${GRAPH}/drives/${drive}/items/${a.id}/content`, "arquivo");
    return r.arrayBuffer();
  }
}
