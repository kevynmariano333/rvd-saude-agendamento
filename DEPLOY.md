# Como publicar o RVD Saúde Agendamento online

Este app era publicado pela plataforma Manus. Como o Manus caiu, os passos
abaixo colocam o mesmo sistema no ar usando serviços independentes,
diretamente a partir deste repositório do GitHub. Nenhuma conta ou
credencial de terceiros pode ser criada por mim — os passos abaixo são para
você seguir (leva uns 15-20 minutos).

Stack recomendada (gratuita para começar):
- **Railway** — hospeda o servidor Node.js e o banco de dados MySQL.
- **Cloudflare R2** — guarda os arquivos XML das notas fiscais enviados no app.

## 1. Crie o projeto no Railway

1. Acesse https://railway.app e crie uma conta (pode usar login com GitHub).
2. Clique em **New Project → Deploy from GitHub repo** e selecione este
   repositório (`rvd-saude-agendamento`), branch `main` (ou a branch que você
   quiser publicar).
3. Railway vai detectar o `package.json` automaticamente. Nas configurações
   do serviço, confirme:
   - Build command: `pnpm build`
   - Start command: `pnpm start`

## 2. Adicione o banco de dados MySQL

1. No mesmo projeto Railway, clique em **New → Database → MySQL**.
2. Abra a aba **Variables** do banco criado e copie o valor de
   `MYSQL_URL` (ou monte a URL com host/usuário/senha/porta mostrados lá).
3. Vá até o serviço do app (não o banco) → **Variables** e crie:
   - `DATABASE_URL` = a URL copiada acima
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = qualquer texto longo e aleatório (ex.: gere em
     https://1password.com/password-generator/ e cole aqui)

## 3. Crie o armazenamento de arquivos (Cloudflare R2)

1. Acesse https://dash.cloudflare.com → **R2** → **Create bucket**. Dê um
   nome, por exemplo `rvd-saude-notas`.
2. Em **R2 → Manage API tokens → Create API token**, crie um token com
   permissão de leitura/escrita nesse bucket. Anote o **Access Key ID** e a
   **Secret Access Key** mostrados (só aparecem uma vez).
3. Ainda no bucket, veja a URL do endpoint S3 (formato
   `https://<account-id>.r2.cloudflarestorage.com`).
4. No serviço do app no Railway → **Variables**, adicione:
   - `S3_BUCKET` = nome do bucket (ex.: `rvd-saude-notas`)
   - `S3_REGION` = `auto`
   - `S3_ENDPOINT` = a URL do endpoint do passo 3
   - `S3_ACCESS_KEY_ID` = a Access Key gerada
   - `S3_SECRET_ACCESS_KEY` = a Secret Key gerada
   - `S3_FORCE_PATH_STYLE` = `true`

(Se preferir usar AWS S3 em vez de R2, funciona igual: crie um bucket e um
usuário IAM com acesso a ele, use a região real da AWS em `S3_REGION` e
deixe `S3_ENDPOINT` em branco.)

## 4. Crie as tabelas do banco (uma única vez)

Depois que `DATABASE_URL` estiver configurada e o serviço tiver feito o
primeiro deploy, abra um shell contra esse serviço (Railway → serviço do
app → **... → Run command**, ou pelo CLI `railway run`) e execute:

```
pnpm db:push
```

Isso cria todas as tabelas (usuários, agendamentos, mensagens, portaria etc.) no
banco novo.

## 5. Acesse o app

Railway gera automaticamente um domínio público (algo como
`seu-app.up.railway.app`) em **Settings → Networking → Generate Domain**.
Abra esse endereço: a tela de login deve aparecer. Cadastre o primeiro
usuário administrador pela tela de cadastro do fornecedor/operador.

## O que muda em relação à versão do Manus

- **Login e cadastro**: já funcionavam com e-mail e senha próprios do app
  (não dependiam do Manus). Continuam iguais.
- **Upload/visualização de XML das notas**: antes passava pelo storage do
  Manus; agora vai direto para o bucket S3/R2 configurado acima (implementado
  em `server/storage.ts` e `server/_core/storageProxy.ts`).
- **Login social do Manus** (`OAUTH_SERVER_URL`, `VITE_APP_ID`) não é mais
  necessário — pode deixar essas variáveis vazias.

## Se preferir outra hospedagem

O app é um servidor Node/Express padrão (`pnpm build` gera `dist/`, `pnpm
start` inicia com `node dist/index.js`) e usa MySQL via Drizzle ORM. Ele
funciona em qualquer plataforma que ofereça isso (Render, Fly.io, um VPS
próprio, etc.) — os mesmos passos de variáveis de ambiente acima se aplicam.
