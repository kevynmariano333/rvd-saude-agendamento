# Publicar o sistema na Vercel

O repositório já vem preparado para a Vercel: `vercel.json` define o build e o
roteamento, e `api/index.ts` expõe a API (tRPC, OAuth e proxy de arquivos) como
uma função serverless. O front-end compilado vai para a CDN da Vercel.

A Vercel não hospeda banco de dados MySQL — os passos abaixo usam um banco
externo. Nenhuma conta pode ser criada por mim; siga o roteiro (leva uns 20
minutos).

## 1. Crie o banco de dados MySQL

Use qualquer MySQL acessível pela internet — Railway, Aiven, PlanetScale ou um
servidor próprio. Anote a URL de conexão no formato:

```
mysql://usuario:senha@host:3306/nome_do_banco
```

> Em ambiente serverless cada instância abre a própria conexão. Prefira um plano
> com pelo menos ~50 conexões simultâneas e mantenha o banco na mesma região da
> função (passo 4) para reduzir latência.

## 2. Crie o armazenamento dos XMLs (S3 ou Cloudflare R2)

1. Crie um bucket (ex.: `rvd-saude-notas`).
2. Gere uma chave de API com leitura/escrita nesse bucket e anote **Access Key
   ID** e **Secret Access Key**.
3. Anote o endpoint S3 (no R2: `https://<account-id>.r2.cloudflarestorage.com`).

Sem essas variáveis o sistema funciona, mas o envio e a leitura de XML das notas
falham.

## 3. Importe o projeto na Vercel

1. Acesse https://vercel.com → **Add New → Project** e importe o repositório
   `rvd-saude-agendamento`.
2. Em **Framework Preset**, deixe **Other**. Não altere Build/Output: o
   `vercel.json` do repositório já define `pnpm exec vite build`, a saída
   `dist/public` e as rotas da API.
3. Escolha a branch que deve ir ao ar (produção costuma ser `main`).

## 4. Configure as variáveis de ambiente

Em **Settings → Environment Variables**, crie para os ambientes *Production* e
*Preview*:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | a URL do passo 1 |
| `JWT_SECRET` | texto longo e aleatório (assina os cookies de sessão) |
| `APP_URL` | a URL pública do projeto, ex.: `https://rvd-saude.vercel.app` |
| `S3_BUCKET` | nome do bucket |
| `S3_REGION` | `auto` (ou a região real, na AWS) |
| `S3_ENDPOINT` | endpoint do passo 2 (vazio na AWS) |
| `S3_ACCESS_KEY_ID` | chave gerada |
| `S3_SECRET_ACCESS_KEY` | segredo gerado |
| `S3_FORCE_PATH_STYLE` | `true` (R2/MinIO); `false` na AWS |
| `RESEND_API_KEY` | opcional — habilita o e-mail de redefinição de senha |
| `MAIL_FROM` | opcional — remetente verificado, ex.: `RVD Saúde <nao-responda@seudominio.com>` |

`NODE_ENV=production` é definido pela própria Vercel; não crie essa variável.

> **`JWT_SECRET` é obrigatório em produção.** Sem ele a função recusa subir, de
> propósito: os cookies seriam assinados com um valor público do repositório e
> qualquer pessoa poderia se passar por qualquer usuário.

Em **Settings → Functions**, escolha a região mais próxima do banco (ex.:
`gru1`, São Paulo).

## 5. Crie as tabelas (uma única vez)

A Vercel não oferece shell no ambiente publicado, então rode a migração da sua
máquina apontando para o banco de produção:

```bash
git clone https://github.com/kevynmariano333/rvd-saude-agendamento
cd rvd-saude-agendamento
pnpm install
DATABASE_URL="mysql://usuario:senha@host:3306/banco" pnpm db:push
```

Isso cria todas as tabelas: usuários, agendamentos, mensagens e as tabelas do
módulo de Portaria (`attendances` e `attendanceEvents`). Rode o mesmo comando
sempre que uma nova migração entrar no repositório.

## 6. Publique e faça o primeiro acesso

Clique em **Deploy**. Ao terminar, abra a URL do projeto: a tela de acesso deve
aparecer com os quatro perfis (Fornecedor, Operador, Portaria e Operação).

Para criar o primeiro administrador, entre com o login de demonstração
`admin` / `admin` no perfil **Operador** — ele cria a conta administradora do
sistema. Depois disso:

1. Cada pessoa se cadastra pela tela de acesso escolhendo o próprio perfil.
2. O administrador libera cada cadastro em **Acessos** (menu da conta) e pode
   trocar o perfil de qualquer conta interna entre Operador, Portaria e Operação.

**Troque a senha do administrador logo no primeiro acesso** (menu da conta →
Alterar senha): enquanto ela for `admin`, qualquer pessoa com a URL entra como
administrador.

## Limites da Vercel que valem conhecer

- **Corpo da requisição: 4,5 MB.** O envio de XML já é limitado a 2 MB pelo
  próprio sistema, então cabe com folga.
- **Duração da função: 30 s** (definido no `vercel.json`). Consultas normais
  respondem em milissegundos; relatórios muito longos podem precisar de mais.
- **Cold start.** A primeira requisição depois de um período ocioso abre uma
  conexão nova com o banco e demora alguns segundos a mais.
- **Sem estado entre requisições.** Nada é guardado em memória do servidor: a
  sessão vive no cookie assinado e os dados, no MySQL.

## Alternativa: servidor Node tradicional

Se preferir um servidor sempre ligado (sem cold start e sem limite de corpo),
o `DEPLOY.md` traz o roteiro com Railway. O mesmo código atende aos dois
formatos: `pnpm build` gera `dist/` e `pnpm start` sobe o Express completo.
