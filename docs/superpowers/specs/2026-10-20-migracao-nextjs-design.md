# Migração do Dashboard Santolin para Next.js — Etapa 1 (paridade)

> Data: 20/10/2026 · Autor da demanda: Mitz (analista de dados) · Status: rascunho para aprovação
>
> Convenção: o que não está marcado foi decidido pelo Mitz na conversa. Itens marcados
> **[decisão do Claude]** são escolhas minhas, que o Mitz pode revisar. Itens em
> **[a cargo do construtor]** ficam livres para quem implementar.

---

## 1. Intenção e porquê

O dashboard atual é um app estático: `index.html` (~900 linhas), `main.js` (~5.100 linhas)
e `styles.css` (~3.200 linhas), sem etapa de build. Duas dores motivam a reescrita:

1. **Peso.** A página carrega tudo de uma vez: todo o JS, as bibliotecas por CDN
   (Chart.js, SheetJS, html2canvas, jsPDF, MSAL) e as planilhas inteiras, que são
   baixadas e processadas no navegador. Um ano cheio passa de 100 mil linhas.
2. **Acoplamento.** Qualquer ajuste numa aba exige mexer no `main.js` principal. O Mitz
   quer poder atualizar um componente sem tocar no resto.

A reescrita também prepara o terreno para duas etapas futuras, **fora do escopo deste
documento**:

- **Etapa 2: construtor de painéis (no-code).** Modelos pré-configurados de gráficos com
  os quais se monta um painel. No começo só o Mitz monta (por exemplo, um painel de
  produção para a gestão e um modelo "por vendedor"). Mais adiante, os gestores também.
- **Etapa 3, junto com a 2: acesso por vendedor.** Cada vendedor entra com o login M365
  e vê **somente a própria produção**. É uma **regra de segurança**: um vendedor ver os
  dados de outro é um problema real. O Mitz manterá o vínculo login → colaborador
  (`colab` na planilha). O acesso de vendedores só começa quando o construtor existir.

A Etapa 1 não entrega nada disso para o usuário, mas **a arquitetura precisa permitir
as duas sem retrabalho**. Na prática: os dados passam pelo servidor, que decide o que
cada pessoa recebe.

## 2. Objetivos

- **G1. Paridade funcional total.** Tudo o que existe hoje chega igual: as abas Visão
  geral, Produção, Retenção & Churn, Cross-sell, Comparativo, Metas (incluindo o
  Acompanhamento semanal e o Modo apresentação/kickoff) e Sinistros, além da Exibição TV,
  do Modo TV, da exportação em PDF, do painel de fontes com os avisos (duplicadas, ativas
  vencidas), dos filtros globais e multisseleção, dos saúdes à parte
  (`saude_fernando.xlsx`, incluindo o download do modelo) e dos temas claro/escuro.
  **Exceção, decidida pelo Mitz:** o upload manual de Excel (a tela de arrastar arquivo
  quando o SharePoint falha, de produção e de sinistros) **é removido**. O SharePoint é a
  única fonte. Se a leitura falhar, a tela mostra o erro e o painel de fontes, sem
  oferecer upload.
- **G2. Números idênticos.** Para os mesmos arquivos, filtros e data de referência, todo
  KPI, gráfico e tabela mostra exatamente os mesmos valores que o dashboard atual. As
  regras de negócio estão em `METRICAS.md` e `SKILL.md` e **não mudam** nesta etapa.
- **G3. Dados lidos no servidor.** O navegador não fala mais com o Graph/SharePoint. O
  servidor Next.js lê as planilhas, processa e entrega ao navegador apenas o que aquele
  usuário pode ver. Na Etapa 1, todos os usuários autorizados veem tudo, mas o ponto de
  corte por usuário já existe no código (ver §5.4).
- **G4. Mais leve.** Cada aba carrega o próprio código sob demanda. Bibliotecas pesadas
  (html2canvas/jsPDF) só carregam quando usadas. O navegador deixa de baixar e processar
  os Excel brutos e recebe os dados já normalizados, só com as colunas usadas e
  compactados.
- **G5. Componentes isolados.** Cada aba e cada bloco relevante (KPI, gráfico, tabela)
  vira um componente próprio. As regras de negócio ficam numa camada de domínio sem
  interface (funções puras em TypeScript), separada da renderização.

## 3. Não-objetivos

- Construtor de painéis, acesso por vendedor e vínculo login → colaborador (Etapas 2 e 3).
- Mudar qualquer definição de métrica ou regra de negócio.
- Redesenho visual. A aparência deve ser a mesma de hoje.
- O `conversor_ghl/`, que continua como ferramenta separada e não é migrado.
- O `scripts/sync_producao.py` (sync de sinistros e-mail → SharePoint), que continua igual.
- A rotina de atualização do Mitz: exportar o relatório e substituir o arquivo no
  SharePoint continua exatamente igual.

## 4. Anti-objetivos (fracasso mesmo que "funcione")

- **O dashboard atual quebrar ou mudar de comportamento** antes da virada. Ele continua
  no ar e funcional até a versão nova estar validada e o Mitz decidir migrar.
- **Um número divergir sem ninguém perceber** (por exemplo, taxa de renovação ou churn).
- **Dados de produção acessíveis a quem não deveria**: sem login, a qualquer conta do
  tenant que não esteja autorizada ou, no futuro, a um vendedor de fora do próprio
  recorte.
- **Código-fonte ou dados expostos** pelo deploy do site antigo (ver §6.1).

## 5. Como funciona

### 5.1 Ferramentas

| Peça | Escolha | Origem |
|---|---|---|
| Framework | Next.js (App Router) com TypeScript | Mitz pediu Next.js; TypeScript é **[decisão do Claude]** |
| Hospedagem | Vercel, plano **Pro**, que a corretora já tem | Mitz |
| Login | Microsoft 365 (Entra ID) do tenant Santolin, com sessão no servidor (por exemplo, Auth.js com o provedor Microsoft Entra ID) | Login M365 do Mitz; a biblioteca é **[decisão do Claude]** |
| Leitura do SharePoint | Graph API com credencial **de aplicativo** (client credentials) no servidor | **[decisão do Claude]** (ver §5.7) |
| Processamento de Excel | SheetJS no servidor | mantém a biblioteca atual |
| Gráficos | Chart.js (via `react-chartjs-2` ou wrapper próprio) | mantém a aparência atual |
| Banco | Postgres pequeno pelo Marketplace da Vercel (por exemplo, Neon), com um ORM leve (por exemplo, Drizzle) | **[decisão do Claude]** |
| Cópia processada das planilhas | Vercel Blob | **[decisão do Claude]** |
| CSS | Tokens/variáveis globais (tema claro/escuro, cores) com estilos por componente (CSS Modules), portados do `styles.css` atual | **[decisão do Claude]**; os detalhes ficam **[a cargo do construtor]** |

### 5.2 Onde o código mora **[decisão do Claude]**

- Mesmo repositório, numa pasta nova `web/`. O app atual na raiz **não é alterado**.
- Um **projeto Vercel novo** com *Root Directory* = `web/` e endereço próprio, por exemplo
  um subdomínio de preview ou `*.vercel.app`, até a virada.
- A única mudança permitida no app atual: incluir `web/` no `.vercelignore` da raiz, para
  o deploy do site antigo não publicar o código novo como arquivos estáticos.
- Uma nova *redirect URI* no registro do app no Azure, para o domínio do app novo. As
  URIs existentes não são tocadas.

### 5.3 Dados: das planilhas ao navegador

```
SharePoint /Santolin/Dashboard/*.xlsx
        │  (Graph, credencial de app, só no servidor)
        ▼
Ingestão no servidor: lista a pasta → para cada arquivo, compara o cTag/eTag
        │  com o snapshot salvo → se mudou: baixa, parseia, normaliza
        ▼
Snapshot normalizado por arquivo (Vercel Blob)  +  metadados (cTag, período, contagens)
        │
        ▼
Montagem do conjunto: aplica a regra de cobertura (abaixo) → une → dedup →
        │  aplica enriquecimentos (motivo de endosso, troca de seguradora, saúde)
        ▼
Recorte por usuário (escopo; ver §5.4)  →  envio ao navegador, compactado
        │
        ▼
Navegador: as funções de domínio calculam KPIs/gráficos/tabelas conforme os filtros
```

Regras que valem nesta etapa:

- **Descoberta de arquivos igual à de hoje.** Lista a pasta e pega todo arquivo cujo
  nome, sem acento e em minúsculas, case com `^producao.*\.xlsx?$`, ignorando os `~$`.
  Sinistros e saúde também seguem o mesmo comportamento atual, com nomes fixos. Nenhuma
  lista de arquivos fica no código.
- **Regra de cobertura (nova, como proteção).** O Mitz exporta um único relatório de
  01/01/2025 a 31/12/2026 e salva como `producao_2026.xlsx`. Hoje não existe
  `producao_2025.xlsx` na pasta. A regra: cada arquivo cobre o intervalo de anos de
  início de vigência que contém (como o `prodYearRange` atual). **Quando dois arquivos
  cobrem o mesmo ano, vale inteiro o modificado por último** naquele ano, e as linhas
  daquele ano no arquivo mais antigo são descartadas em bloco. O painel de fontes
  mostra isso ("producao_2025.xlsx: 2025 ignorado, coberto por producao_2026.xlsx").
  Depois disso, a dedup linha a linha atual (`prodDedupeKey`) continua valendo como
  segunda proteção. **Isso não deve alterar nenhum número com os arquivos atuais**
  (G2), porque não há sobreposição hoje.
- **Proteção contra linha perdida [decisão do Claude].** Um arquivo só "toma" um ano
  de outro se tiver, naquele ano, pelo menos 50% das linhas que o outro tem. Abaixo
  disso (por exemplo, um endosso antigo perdido dentro do `producao_2026.xlsx`), nada é
  descartado: as linhas seguem para a dedup normal e o painel de fontes mostra um aviso
  de sobreposição. A ordem de leitura dos arquivos na união segue a do código atual,
  para a dedup "primeiro vence" dar o mesmo resultado (G2).
- **Enriquecimentos que cruzam linhas rodam no servidor, antes do recorte por usuário
  [decisão do Claude].** Motivo de endosso, troca de seguradora e qualquer marcação que
  dependa de outras apólices (por exemplo, a sucessora de uma renovação) são calculados
  sobre a base inteira e gravados como campos da linha. Assim, na Etapa 3 o recorte por
  vendedor não quebra essas marcações. A decisão sobre quais métricas o vendedor vê
  calculadas sobre a própria carteira fica para o documento da Etapa 3.
- **Normalização idêntica à atual.** Mapeamento de colunas (`COL`), `normSit`,
  `isApolice`, datas sem erro de fuso (comparação por `YYYY-MM-DD`) e enriquecimentos na
  mesma ordem de `loadProducaoFromSources`.
- **Reprocessar.** O botão "Limpar cache e recarregar" vira "Reprocessar fontes":
  descarta os snapshots e reprocessa tudo. É para quem é administrador.
- **Por que calcular no navegador.** Os filtros (vigência, tipo, colaborador, grupo,
  ramo, seguradora) são interativos e combinados. Calcular no navegador mantém a
  resposta instantânea como hoje, e as funções de domínio são puras e rodam também no
  servidor, o que a Etapa 2 vai precisar. **[decisão do Claude]** Se o tamanho do envio
  pesar demais, o construtor pode mover agregações para o servidor sem mudar a camada
  de domínio.

### 5.4 Acesso

- Login obrigatório com M365, restrito ao tenant Santolin (`59190e65-…`). Nada de
  dados, nem mesmo os metadados das fontes, sai do servidor sem sessão válida.
- **Na Etapa 1, só entra quem estiver numa lista de usuários autorizados** (tabela
  `users` no banco, com `email` e `role`). Os papéis já existem no modelo: `admin`
  (Mitz), `gestao` e `vendedor` (reservado para a Etapa 3). Na Etapa 1, `admin` e
  `gestao` veem tudo, e só `admin` reprocessa fontes. **[decisão do Claude]** Isso evita
  que qualquer conta do tenant passe a ver a produção, já que hoje o acesso depende da
  permissão de cada um na pasta do SharePoint e o servidor vai ler com credencial
  própria.
- **Ponto de corte único.** Toda entrega de dados passa por uma função
  `escopoDoUsuario(sessão) → filtro de linhas`. Na Etapa 1 ela devolve "tudo" para
  `admin` e `gestao` e "nada" para os demais. Na Etapa 3 passa a devolver "linhas com
  `colab` ∈ colaboradores vinculados". O filtro é aplicado **no servidor, antes do
  envio**.
- Os segredos (client secret do Graph, chaves do banco) ficam só em variáveis de
  ambiente da Vercel.
- **Cadastro de usuários na Etapa 1 [decisão do Claude]:** por script de seed versionado
  (lista de e-mails e papéis), sem tela de administração. A tela de administração
  chega na Etapa 2/3, junto com o vínculo login → colaborador. A lista inicial de
  `gestao` vem do Mitz na hora do deploy.

### 5.7 Registros no Azure **[decisão do Claude]**

- **Um registro novo**, "Dashboard Web (Next.js)", do tipo cliente confidencial
  (plataforma Web, com client secret). Serve para o login (delegado, `openid profile
  email User.Read`) e para a leitura do SharePoint no servidor, com permissão de
  aplicativo **`Sites.Selected`** concedida **só ao site `santolinseguros.sharepoint.com`**
  com papel de leitura. Assim, um segredo vazado não expõe o tenant inteiro.
- Os registros existentes (`18d14ac5`, SPA do app atual, e `b5812845`, do sync) **não são
  alterados nem reutilizados**: o app atual continua intacto e o sync mantém permissão
  de escrita, que o dashboard não precisa ter.
- Conceder `Sites.Selected` exige consentimento de administrador do tenant e um passo
  extra (atribuir o site ao app via Graph/PowerShell). **Quem executa é o Mitz**, que
  administra o tenant. O plano deve trazer esse passo a passo, como o `scripts/README.md`
  faz para o sync, e as tarefas que dependem dele devem vir marcadas como "aguarda Mitz".

### 5.5 Estrutura do código **[a cargo do construtor, com esta orientação]**

- `web/src/domain/`: regras de negócio puras (situações, `isApolice`, dedup, cobertura,
  churn, renovação, metas, sinistros, saúde, formatadores). Sem React e sem acesso a
  rede. É o que os testes de paridade exercitam.
- `web/src/server/`: ingestão (Graph, parse, snapshots), montagem do conjunto, escopo e
  autenticação.
- `web/src/app/`: rotas. Uma rota por aba é preferível para carregar sob demanda; a
  Exibição TV e o modo apresentação também têm rotas próprias.
- `web/src/components/`: KPI, gráfico, tabela, multisseleção, painel de fontes etc.
- O estado de filtros globais é compartilhado entre as abas, como hoje.

### 5.6 Modo TV e Exibição TV

- O Modo TV continua salvo **por aparelho** (hoje em `localStorage`).
- A TV roda num **notebook dedicado**, num navegador comum, logado com a **conta M365 do
  Mitz** (papel `admin`). Não há conta especial nem papel de TV nesta etapa.
- A tela fica ligada o dia inteiro, então a sessão precisa se renovar sozinha (refresh
  token no servidor) para não deslogar no meio do expediente. Se a renovação falhar, a
  tela mostra um aviso claro de "entrar novamente", em vez de dados velhos sem aviso.
  Os detalhes ficam **[a cargo do construtor]**.

## 6. Restrições

1. **O app atual não pode quebrar** (anti-objetivo). Nada na raiz muda, exceto a linha
   no `.vercelignore` (§5.2).
2. **As regras do `METRICAS.md` valem como especificação.** O código antigo é a
   referência de comportamento: quando o documento e o código divergirem, prevalece o
   código atual e a divergência é anotada para o Mitz decidir depois.
3. **O fluxo Azure atual não é alterado** (registros e permissões existentes). Adições
   são permitidas: nova redirect URI e uma credencial de servidor com leitura da pasta
   (ver §5.7).
4. Volume: anos com mais de 100 mil linhas. Sem `Math.min(...array)` e semelhantes, e
   com a ingestão respeitando os limites de memória e tempo das funções da Vercel Pro.

## 7. Como validar (critério de pronto)

- **Teste de paridade automatizado.** Carregar o `main.js` atual num ambiente Node
  (jsdom/vm) e as funções novas de `domain/` sobre os **mesmos arquivos reais** e a
  mesma "data de hoje" fixada, e comparar as saídas de cada aba (KPIs, séries dos
  gráficos e linhas das tabelas) para um conjunto de combinações de filtros. Diferença
  zero. Os arquivos reais **não** vão para o repositório; ficam numa pasta local
  ignorada pelo git.
- **Conferência manual.** As duas versões rodando em paralelo, em endereços diferentes,
  com o Mitz comparando lado a lado.
- **A virada é decisão do Mitz**, depois da validação. O documento não define data.

## 8. Fica a cargo do construtor

Organização interna das pastas, nomes, a biblioteca de estado de filtros, o formato de
serialização dos dados enviados ao navegador, a estratégia de cache HTTP, como portar o
CSS mantendo a aparência, a ordem de migração das abas e o desenho detalhado do harness
de paridade.

## 9. Perguntas em aberto

Nenhuma para a Etapa 1. Fica registrado para o documento da Etapa 3: quais métricas o
vendedor vê calculadas sobre a própria carteira e quais (se alguma) mostram referência
da corretora inteira.
