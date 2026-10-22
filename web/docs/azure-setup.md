# Azure — registro "Dashboard Web (Next.js)"

> **AGUARDA MITZ.** Este passo a passo precisa ser executado por quem administra o tenant
> (consentimento de administrador e concessão no site). As tarefas que leem o SharePoint
> de verdade dependem dele. Até lá, o app roda com `FONTE=local` (pasta local).

O app novo lê as planilhas **no servidor**, com credencial de aplicativo (*client credentials*),
e usa o login Microsoft 365 para os usuários. Para isso cria-se **um registro novo**, sem mexer
nos existentes (`18d14ac5…` do app atual e `b5812845…` do sync).

Tenant: `59190e65-5cad-4885-9f2d-77a59385667b` · Site: `santolinseguros.sharepoint.com` · Biblioteca `Santolin` · Pasta `Dashboard`.

---

## 1. Criar o registro

1. Portal Azure → **Microsoft Entra ID** → **Registros de aplicativo** → **Novo registro**
   - Nome: `Dashboard Web (Next.js)`
   - Tipos de conta: **Apenas neste diretório organizacional**
   - Plataforma: **Web**, com os URIs de redirecionamento:
     - `https://<domínio novo>/api/auth/callback/microsoft-entra-id`
     - `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - **Registrar**.
2. Anote o **ID do aplicativo (cliente)** → `AZURE_CLIENT_ID` e `AUTH_MICROSOFT_ENTRA_ID_ID`.
3. Anote o **ID do diretório (locatário)** → `AZURE_TENANT_ID` (`59190e65-5cad-4885-9f2d-77a59385667b`).

## 2. Client secret

1. **Certificados e segredos** → **Novo segredo do cliente**
   - Descrição: `dashboard-web`; validade: 24 meses (renovar antes de expirar).
2. Copie o **Valor** na hora (só aparece uma vez) → `AZURE_CLIENT_SECRET` e `AUTH_MICROSOFT_ENTRA_ID_SECRET`.

## 3. Permissões delegadas (login)

**Permissões de API** → **Adicionar permissão** → **Microsoft Graph** → **Permissões delegadas**:
`openid`, `profile`, `email`, `offline_access`, `User.Read`.

> O login usa o atributo `mail` da conta. Ele precisa ser **igual ao e-mail da lista de
> autorizados** (seed). Se a conta tiver `mail` diferente do e-mail usado na lista, o acesso
> será negado.

## 4. Permissão de aplicativo `Sites.Selected`

1. **Adicionar permissão** → **Microsoft Graph** → **Permissões de aplicativo** → `Sites.Selected`.
2. **Conceder consentimento de administrador para [tenant]** e confirmar (status verde).

`Sites.Selected` sozinha **não dá acesso a nenhum site**. O próximo passo concede leitura só ao site da biblioteca.

## 5. Conceder leitura no site

A biblioteca `Santolin` fica no **site raiz** `santolinseguros.sharepoint.com` (é o que o app
atual consulta). `Sites.Selected` precisa cobrir **esse site**.

### 5.1 Obter o id do site

No [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer), logado como administrador
(consentir `Sites.FullControl.All` no Graph Explorer, só para este passo):

```
GET https://graph.microsoft.com/v1.0/sites/santolinseguros.sharepoint.com
```

Copie o campo `id` (formato `santolinseguros.sharepoint.com,<guid>,<guid>`).

### 5.2 Conceder o papel de leitura

```
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [
    { "application": { "id": "<CLIENT_ID>", "displayName": "Dashboard Web (Next.js)" } }
  ]
}
```

Use `read` (nunca `write`): o dashboard só lê.

### 5.3 Alternativa em PowerShell

Com o módulo **Microsoft.Graph** (`Install-Module Microsoft.Graph`):

```powershell
Connect-MgGraph -Scopes "Sites.FullControl.All"
$site = Get-MgSite -SiteId "santolinseguros.sharepoint.com"
$params = @{
  roles = @("read")
  grantedToIdentities = @(@{ application = @{ id = "<CLIENT_ID>"; displayName = "Dashboard Web (Next.js)" } })
}
New-MgSitePermission -SiteId $site.Id -BodyParameter $params
```

Ou com **PnP.PowerShell**:

```powershell
Connect-PnPOnline -Url "https://santolinseguros.sharepoint.com" -Interactive
Grant-PnPAzureADAppSitePermission -AppId "<CLIENT_ID>" -DisplayName "Dashboard Web (Next.js)" `
  -Site "https://santolinseguros.sharepoint.com" -Permissions Read
```

### 5.4 Verificar

Peça um token de aplicativo e liste a pasta (substitua os valores):

```powershell
$body = @{ client_id="<CLIENT_ID>"; client_secret="<SECRET>"; scope="https://graph.microsoft.com/.default"; grant_type="client_credentials" }
$t = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/oauth2/v2.0/token" -Body $body).access_token
$h = @{ Authorization = "Bearer $t" }
$site = Invoke-RestMethod -Headers $h -Uri "https://graph.microsoft.com/v1.0/sites/santolinseguros.sharepoint.com"
$drives = Invoke-RestMethod -Headers $h -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/drives"
$drive = $drives.value | Where-Object { $_.name -ieq "Santolin" }
(Invoke-RestMethod -Headers $h -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root:/Dashboard:/children").value.name
```

Deve listar os `.xlsx` da pasta Dashboard. `403` = o passo 5.2 não foi aplicado (ou foi em outro site);
`401/400` = `CLIENT_ID`/`SECRET`/tenant errados. Para conferir o que foi concedido:
`GET /sites/{site-id}/permissions`.

## 6. Variáveis de ambiente (Vercel)

| Variável | Valor |
|---|---|
| `AZURE_TENANT_ID` | `59190e65-5cad-4885-9f2d-77a59385667b` |
| `AZURE_CLIENT_ID` | ID do aplicativo (passo 1) |
| `AZURE_CLIENT_SECRET` | Valor do segredo (passo 2) |
| `AUTH_SECRET` | segredo aleatório (`npx auth secret` ou `openssl rand -base64 32`) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | mesmo ID do aplicativo |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | mesmo valor do segredo |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/59190e65-5cad-4885-9f2d-77a59385667b/v2.0` (exatamente isso) |
| `AUTH_TRUST_HOST` | `true`, se o login reclamar de host não confiável (fora da Vercel, p.ex. domínio próprio atrás de proxy) |

Para desenvolvimento sem Azure: `FONTE=local` e `FONTE_DIR=<pasta com os .xlsx>`.
Nunca commitar segredos; nunca colar o segredo em chat ou logs.
