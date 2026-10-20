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
  private tokenEmCurso: Promise<string> | null = null;
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

  private async lerJson<T>(r: Response): Promise<T> {
    let texto: string;
    try {
      texto = await r.text();
    } catch {
      throw new ErroFonte("rede", "Conexão interrompida ao ler a resposta do Microsoft Graph");
    }
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new ErroFonte("http", "Resposta do Microsoft Graph não é JSON válido", r.status);
    }
  }

  private obterToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiraEm - MARGEM_TOKEN_MS) return Promise.resolve(this.token.valor);
    if (!this.tokenEmCurso) {
      this.tokenEmCurso = this.pedirToken().finally(() => {
        this.tokenEmCurso = null;
      });
    }
    return this.tokenEmCurso;
  }

  private async pedirToken(): Promise<string> {
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
    const j = await this.lerJson<{ access_token?: string; expires_in?: number }>(r);
    if (!j || typeof j.access_token !== "string" || !j.access_token) throw new ErroFonte("auth", "Resposta de token sem access_token");
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
    const site = await this.lerJson<{ id?: string }>(await this.get(`${GRAPH}/sites/${HOST}`, "site"));
    if (!site || typeof site.id !== "string" || !site.id) throw new ErroFonte("http", "Resposta do Graph sem id do site");
    const dj = await this.lerJson<{ value?: { id: string; name: string }[] }>(
      await this.get(`${GRAPH}/sites/${site.id}/drives`, "site"),
    );
    if (!dj || !Array.isArray(dj.value)) throw new ErroFonte("http", "Resposta do Graph sem lista de bibliotecas");
    const d = dj.value.find((x) => String(x.name).toLowerCase() === BIBLIOTECA.toLowerCase());
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
      const j: { value?: ItemGraph[]; "@odata.nextLink"?: string } = await this.lerJson(await this.get(url, "pasta"));
      if (!j || !Array.isArray(j.value)) throw new ErroFonte("http", "Resposta do Graph sem lista de arquivos");
      for (const it of j.value) itens.push(it);
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
    try {
      return await r.arrayBuffer();
    } catch {
      throw new ErroFonte("rede", "Conexão interrompida ao baixar o arquivo");
    }
  }
}
