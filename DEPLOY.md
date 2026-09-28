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

## 4. As tabelas do banco (automático)

Não há passo manual. Com `DATABASE_URL` configurada, o próprio servidor aplica
as migrações pendentes toda vez que sobe — na primeira vez isso cria todas as
tabelas; nas seguintes, aplica só o que faltar. No log do deploy aparece:

```
[Migrações] 30 migração(ões) aplicada(s). Total no banco: 30.
[Migrações] Banco já estava em dia (30 aplicadas).
```

Se a migração falhar, o servidor não sobe e o deploy é marcado como falho de
propósito: assim o Railway mantém no ar a versão anterior, que funciona, em vez
de publicar uma que lê colunas inexistentes. O erro aparece no log com a
mensagem do banco.

O comando `pnpm db:push` continua existindo para o desenvolvimento local, onde
ele também gera a migração a partir de mudanças no schema.

## 5. Acesse o app

Railway gera automaticamente um domínio público (algo como
`seu-app.up.railway.app`) em **Settings → Networking → Generate Domain**.
Abra esse endereço: a tela de login deve aparecer. Cadastre o primeiro
usuário administrador pela tela de cadastro do fornecedor/operador.

## 6. O que mantém o portal de pé

Estas configurações já vêm no `railway.json` do repositório, então o Railway as
aplica sozinho a cada deploy. Estão descritas aqui para quem precisar conferir
ou mexer.

**Verificação de saúde** — o servidor responde em dois endereços:

- `GET /api/vivo` — responde `{"ok":true}` sem tocar em nada. Serve para saber
  se o processo está respirando.
- `GET /api/saude` — também pergunta ao banco. Responde 200 quando o banco
  responde e 503 quando não. É este que o Railway consulta antes de mandar as
  pessoas para uma versão nova: se a versão nova não conseguir falar com o
  banco, o deploy não entra no ar e a versão que estava funcionando continua.

**Vigia de fora** — quem avisa que o portal caiu não pode morar dentro dele:
servidor fora do ar não manda e-mail sobre estar fora do ar. Por isso a pergunta
é feita de fora, e há duas formas (dá para usar as duas):

*No GitHub, já pronto no repositório.* O workflow
`.github/workflows/monitor-do-portal.yml` pergunta `/api/saude` de quinze em
quinze minutos, de uma máquina do GitHub. Três tentativas sem resposta e ele
falha — e o GitHub manda e-mail para o dono do repositório. Falta um passo, uma
vez só: **Settings → Secrets and variables → Actions → Variables → New
repository variable**, nome `URL_DO_PORTAL`, valor o endereço do portal (por
exemplo `https://agendamento.rvdsaude.com.br`, sem barra no fim). Sem essa
variável o monitor falha de propósito, dizendo que falta o endereço. Dá para
testar na hora em **Actions → Monitor do portal → Run workflow**. Dois detalhes:
o GitHub só roda agendamento a partir da branch principal, e ele desliga
agendamentos em repositório parado há 60 dias — se ninguém publicar nada por
dois meses, ele avisa por e-mail e basta reativar.

*Num monitor externo, se quiser aviso no celular.* Um serviço gratuito
(UptimeRobot, Better Stack) apontado para `https://SEU-ENDERECO/api/saude` a
cada 5 minutos avisa mais rápido que o GitHub e manda notificação no telefone,
não só e-mail. Leva uns três minutos para configurar: criar conta, **Add New
Monitor** → tipo HTTP(s) → colar o endereço → intervalo de 5 minutos.

Nos dois casos a pergunta é `/api/saude`, e não a página inicial: essa rota só
responde 200 quando o banco também responde. Portal de pé com banco fora serve
erro em toda tela, e uma página inicial que carrega esconderia exatamente isso.

**Reinício automático** — `restartPolicyType: ON_FAILURE`. Se o processo morrer,
o Railway sobe outro na hora.

**Desligamento sem derrubar ninguém** — a cada deploy o Railway manda um sinal
de encerramento. O servidor para de aceitar conexão nova, deixa as requisições
em andamento terminarem, fecha o banco e só então sai. Quem estava salvando um
agendamento no momento do deploy não perde o que fez.

**Erro solto não derruba mais o servidor** — uma falha isolada (um e-mail que
não saiu, um upload que falhou) é registrada no log e o portal continua no ar.
Antes, uma falha dessas encerrava o processo inteiro.

**Conexão com o banco** — o servidor mantém o canal vivo e devolve conexão
parada antes que o MySQL a derrube. Era a causa dos erros que apareciam depois
de horas sem movimento e sumiam quando alguém reiniciava o serviço.

## 7. Backup e restauração

**A cópia acontece sozinha.** Todo dia, às três da manhã de Brasília, o próprio
servidor lê o banco inteiro e grava um arquivo `backups/rvd-saude-AAAA-MM-DD-HHMM.json.gz`
no bucket R2. O destino é o bucket, e não o Railway, de propósito: cópia
guardada ao lado do original não protege contra o caso que mais importa, que é
perder o provedor. O resultado do último backup aparece no painel do
administrador, e o botão ao lado gera um na hora.

**Se parar, você é avisado.** Duas noites seguidas sem backup bom e o sistema
manda um e-mail para todos os administradores ativos, dizendo desde quando
parou, qual erro o provedor devolveu e o que conferir. Não avisa na primeira
falha — uma noite ruim acontece, e e-mail que chega à toa é e-mail que ninguém
lê. Enquanto o problema durar, o aviso sai uma vez por dia, não a cada dez
minutos. Isso depende do e-mail estar configurado (a chave do Brevo); sem ele,
a falta de backup fica registrada no log e no quadro do portal, mas não sai
daqui.

**A volta tem script e já foi testada.** O caminho de volta é
`scripts/restaurar-backup.mjs`, e ele foi rodado de ponta a ponta contra um
banco vazio: backup gerado no formato real, migrações aplicadas, restauração
confirmada — 62 linhas em 13 tabelas, conferidas de volta no banco uma a uma,
com acentuação intacta. Backup que nunca foi restaurado é esperança, não cópia.

Para restaurar, abra **Console** no serviço do app no Railway (não no banco) —
é de lá que o banco é alcançável pela rede interna e as credenciais do bucket já
existem — e rode:

```bash
# 1. Que backups existem?
node scripts/restaurar-backup.mjs --listar

# 2. O que este arquivo tem dentro? (não grava nada)
node scripts/restaurar-backup.mjs backups/rvd-saude-2026-09-28-0300.json.gz

# 3. Restaurar de verdade
node scripts/restaurar-backup.mjs backups/rvd-saude-2026-09-28-0300.json.gz --confirmar
```

O passo 2 não é opcional na prática: ele imprime a data do backup e quantas
linhas tem cada tabela, que é como se descobre que o arquivo escolhido é o
errado **antes** de apagar o certo. A restauração **apaga** o conteúdo atual das
tabelas listadas e põe o do arquivo no lugar — por isso gravar exige o
`--confirmar` escrito à mão. No fim o script conta as linhas de volta no banco e
falha se as contagens não baterem: "o insert não deu erro" não é o mesmo que "os
dados estão lá".

O arquivo também pode ser um caminho local, o que serve para restaurar num banco
de teste antes de mexer no de verdade — que é o ensaio que vale a pena fazer uma
vez por ano, com o sistema no ar e ninguém apressado.

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
