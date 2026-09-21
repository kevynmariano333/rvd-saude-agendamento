# Arquitetura — RVD Saúde

Como o sistema é montado, onde cada peça mora e por que as decisões foram
tomadas assim. Para publicar em produção, veja [DEPLOY.md](DEPLOY.md).

## O que o sistema faz

Três fluxos operacionais sobre a mesma base de dados:

**Agendamento** — o fornecedor envia o XML da nota fiscal e sugere data; o
operador agenda, confirma o recebimento e emite o comprovante.

**Portaria** — o porteiro registra a chegada do caminhão no portão. Cada etapa
vira um evento com carimbo de tempo, então a linha do tempo de um atendimento é
reconstruível depois:

```
chegada_registrada → entrada_aprovada    → atendimento_iniciado
                   ↘ entrada_recusada      → liberacao_registrada
                                            → atendimento_concluido
```

**Operação/pátio** — acompanha o caminhão dentro da empresa até a saída.

Tamanho aproximado: 19 mil linhas, 17 telas, 46 endpoints, 8 tabelas, 198
testes automatizados.

## Onde cada coisa está hospedada

| Peça | Serviço | Observação |
|---|---|---|
| Servidor Node + site | Railway | plano Hobby |
| Banco MySQL | Railway | volume gerenciado, rede interna |
| XMLs das notas | Cloudflare R2 | bucket `rvd-saude-notas` |
| Código-fonte | GitHub | |
| E-mail transacional | Resend | só recuperação de senha |
| Fontes DM Sans e Manrope | Google Fonts | |

**O Railway é ponto único de falha**: aplicação e banco vivem no mesmo projeto,
e uma indisponibilidade derruba os dois. Os XMLs no R2 e o código no GitHub
sobrevivem independentemente, mas não substituem o banco — é lá que estão
agendamentos, histórico, conversas, registros de portaria e logins.

O banco só aceita conexão pelo host interno `mysql.railway.internal`, que existe
apenas dentro da rede do projeto. Para acessar de fora (um backup, por exemplo)
é preciso usar a URL pública que o Railway expõe nas variáveis do serviço MySQL.

## Linguagens e bibliotecas

**TypeScript no projeto inteiro**, cliente e servidor. A escolha se paga na
fronteira entre os dois: o tipo de uma resposta do servidor chega ao componente
sem ser redeclarado, e renomear uma coluna quebra a compilação no ponto exato em
vez de virar erro em produção.

### Navegador

| Biblioteca | Papel |
|---|---|
| React 19 | interface |
| Wouter | troca de telas sem recarregar |
| Tailwind CSS 4 | estilos e o sistema de temas claro/escuro |
| TanStack Query | cache e revalidação dos dados |
| Recharts | gráficos do dashboard |
| jsPDF + qrcode | comprovante em PDF, gerado no próprio navegador |
| SheetJS (xlsx) | exportação de relatórios |
| Vite | empacotamento |

### Servidor

| Biblioteca | Papel |
|---|---|
| Express | servidor HTTP |
| tRPC | camada de API |
| Drizzle ORM | acesso ao MySQL com tipos |
| Zod | validação de toda entrada |
| jose | assinatura dos cookies de sessão |
| AWS SDK (S3) | leitura e escrita no R2 |

## A API

### Interna

O sistema não expõe REST. Usa **tRPC**: o cliente chama procedimentos do
servidor como funções (`trpc.appointments.list.useQuery()`), e os tipos
atravessam sem esquema intermediário nem documentação para manter em dia.

Os 46 endpoints estão em nove grupos, em `server/routers.ts`:

| Grupo | Responsabilidade |
|---|---|
| `auth` | login, cadastro, sessão, troca e recuperação de senha |
| `appointments` | criar, listar, agendar, receber, rejeitar, resgatar |
| `suggestions` | sugestões de horário feitas pelo fornecedor |
| `messages` | conversa por nota fiscal |
| `accessRequests` | fila de aprovação de cadastros novos |
| `attendances` | portaria e pátio |
| `calendar` | agenda por período |
| `analytics` | indicadores do dashboard |
| `staff` | gestão de pessoas |

O controle de acesso é feito por tipo de procedimento — `publicProcedure`,
`protectedProcedure`, `adminProcedure` — e não por verificação espalhada dentro
de cada função.

### Externas

Apenas três, e nenhuma no caminho crítico do agendamento:

1. **Cloudflare R2**, pelo protocolo S3 — guarda os XMLs. O arquivo nunca é
   servido direto: `/manus-storage/{chave}` redireciona para uma URL assinada
   válida por 5 minutos, então o bucket permanece fechado.
2. **Resend** — envia o e-mail de recuperação de senha, por uma chamada HTTP
   (`server/_core/mailer.ts`). Sem SDK: é um endpoint só.
3. **Google Fonts** — as duas famílias tipográficas.

Não há integração com SEFAZ, ERP, mensageria ou pagamento. **O XML é
interpretado localmente** por `server/xmlInvoice.ts`; nenhum dado fiscal sai do
sistema para ser lido.

## O caminho de um agendamento

1. O fornecedor escolhe o XML; o navegador o converte para base64.
2. O servidor recebe por tRPC e valida tamanho e extensão com Zod.
3. `xmlInvoice.ts` extrai nota, CNPJ do destinatário, pedido, valor e volumes.
4. O arquivo sobe para o R2; o banco guarda apenas a chave.
5. Nasce uma linha em `appointments` com status `pending`.
6. O operador agenda: o status passa a `scheduled` e a transição é registrada em
   `appointmentStatusHistory`.
7. O comprovante em PDF é gerado **no navegador**, com um QR Code cujo token é
   assinado pelo servidor.
8. Quem lê o QR cai numa página pública que consulta o agendamento na hora — o
   papel não carrega a confirmação, ele aponta para ela.

## Banco de dados

Oito tabelas, 24 migrações versionadas em `drizzle/`:

| Tabela | Conteúdo |
|---|---|
| `users` | logins, perfil e situação de acesso |
| `appointments` | as notas e seu estado |
| `appointmentStatusHistory` | toda transição de status, com autor |
| `appointmentSuggestions` | horários propostos pelo fornecedor |
| `appointmentMessages` | conversa por nota |
| `passwordResetTokens` | tokens de recuperação, só o hash |
| `attendances` | atendimentos da portaria |
| `attendanceEvents` | eventos de cada atendimento |

As migrações são aplicadas pelo comando `pnpm db:push`, configurado no Railway
como passo anterior ao deploy.

## Perfis e visibilidade

Cinco perfis: `admin`, `operator`, `supplier`, `portaria`, `operacao`.

- **Nenhum cadastro entra sozinho.** Todo registro novo nasce pendente e espera
  aprovação de um administrador, inclusive os de operador — a tela de cadastro é
  aberta a qualquer pessoa, e um operador aprovado enxerga a base inteira.
- **O fornecedor vê o que é do CNPJ dele**, incluindo o que outros logins da
  mesma empresa enviaram. O recorte é aplicado no servidor em toda consulta, não
  escondendo elementos na tela.
- **Aprovação é reconferida a cada requisição**, não só no login, para que
  revogar um acesso valha na hora e não quando o cookie expirar.

Senhas usam scrypt com sal por usuário. A sessão é um cookie assinado com
`JWT_SECRET`; sem essa variável o servidor **se recusa a subir em produção**,
porque o valor de reserva está no código público e permitiria forjar sessões.

## Estrutura de pastas

```
client/src/       interface
  pages/          uma tela por arquivo, espelhando as rotas
  components/     peças reaproveitadas e diálogos
  lib/            regras puras do cliente (filtros, formatação, PDF)
  contexts/       tema
server/           servidor
  _core/          infraestrutura: tRPC, sessão, env, mailer, S3
  routers.ts      todos os endpoints
  db.ts           consultas
  *.test.ts       testes ao lado do código que testam
drizzle/          schema e migrações
shared/           tipos e constantes usados pelos dois lados
```

## Verificações

```
pnpm run check   # tipos + regras de hooks do React
pnpm run test    # 198 testes
pnpm run build   # compila cliente e servidor
```

A checagem de hooks está no `check` por um motivo concreto: um hook chamado
depois de um `return` antecipado não é detectado pelo compilador nem pelos
testes, e derruba a tela inteira no navegador. Já aconteceu uma vez, no
dashboard.

## Fragilidades conhecidas

Em ordem de risco:

1. **Não há backup automático do banco.** É o dado que não existe em nenhum
   outro lugar.
2. **Railway é ponto único**: aplicação e banco caem juntos.
3. **Recuperação de senha está desligada na interface** — o fluxo está pronto e
   testado, mas o Resend só entrega para o dono da conta enquanto o domínio
   `rvdsaude.com.br` não for verificado (registros SPF e DKIM no DNS).
4. **Não há monitoramento**: uma queda é descoberta por quem tenta usar.
5. As telas internas não têm teste de ponta a ponta; a cobertura está nas regras
   de negócio e nos endpoints.
