# Contexto do RVDlog+ para quem continua o trabalho

Este arquivo existe para que qualquer chat novo entenda o projeto sem depender
do histórico de conversa. Leia antes de mexer em qualquer coisa.

## O projeto

Sistema de agendamento de recebimento de notas fiscais da RVD Saúde, da Amil
(Hospital HSH e Maternidade MSH), da RVD Distribuidora de Produtos e da LLT
Distribuição de Produtos.

- Repositório: `kevynmariano333/rvd-saude-agendamento`
- Branch de trabalho: `claude/rvd-saude-agendamento-launch-w6ufta`
- `main` é o que o Railway publica. Cada push no `main` vira deploy em
  `https://agendamentorvd.up.railway.app`.

## Regras combinadas com o Kevyn

- **Publicar no `main` só com autorização explícita** ("sobe"). Trabalhar e
  commitar na branch pode; subir para o `main` não sem o "sobe".
- **Fazer só o que for pedido.** Não mexer em outras partes do sistema por conta
  própria.
- **Não mexer na LLT** sem pedido específico.
- **SIAL: só leitura.** Nada escreve no SIAL.
- **Nunca mostrar chaves, senhas ou tokens** no chat, em arquivo ou em commit.
  Só os nomes das variáveis.
- **Dados operacionais não entram em commit** (planilhas, XMLs reais, exportações).
- **Nota interna do SAP/HIS nunca aparece para fornecedor.**
- **Commit sem nome de modelo de IA** na mensagem.

Esses pontos vieram do Kevyn. Quando houver dúvida sobre o alcance de uma regra,
pergunte antes de agir.

## Como rodar as verificações

```
pnpm vitest run     # testes (1047 passando no último check)
pnpm tsc --noEmit   # tipos
pnpm lint           # lint do cliente
pnpm build          # build de produção
```

## Onde fica o quê

- `server/routers.ts`: todas as rotas tRPC (agendamentos, sugestões, relatórios,
  recebimento sem agendamento, etc.).
- `server/db.ts`: consultas ao banco.
- `server/recebimentoApi.ts`: API de recebimento para sistemas externos
  (`GET /api/recebimento/resumo`, com chave própria).
- `server/leituraDoBi.ts`: leitura do robô do BI (`GET /api/bi/notas-recebimento`).
- `shared/horariosDaAgenda.ts`: regras de horário e de ocupação das docas.
- `shared/empresas.ts`, `shared/recipients.ts`: empresas, unidades e CNPJs.
- `shared/recebimentoSemAgendamento.ts`: resumo de notas sem agendamento.
- `shared/sugestoesEmAberto.ts`: quem sugeriu primeiro fica com o horário.
- `shared/purchaseOrders.ts`: pedido de compra (zeros não valem).
- `client/src/pages/OperatorDashboard.tsx`: tela do operador e do planejador.
- `client/src/pages/OperatorOverview.tsx`: dashboard do operador.
- `client/src/pages/SupplierDashboard.tsx`: tela do fornecedor.
- `client/src/pages/RelatorioSemAgendamento.tsx`: relatório de notas sem agendamento.
- `client/src/components/SeletorDeHorario.tsx`: escolha de horário.
- `client/src/components/DashboardSemAgendamento.tsx`: dashboard de sem agendamento.
- `client/src/lib/planilhaSemAgendamento.ts`: exportação para Excel.

## Variáveis de ambiente (só os nomes)

`DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`,
`BREVO_API_KEY`, `RESEND_API_KEY`, `RECEBIMENTO_API_TOKEN`, `BI_LEITURA_TOKEN`.
Os valores ficam só no Railway.

## O que já está no ar

- Fornecedor: envio de XML com o pedido da nota (zeros não valem), sugestão de
  data, escolha de horário livre (inclusive horário ocupado, que a mesa decide),
  filtro por status no histórico.
- Operador e planejador: fila por status, agendar, receber, concluir, recusar com
  motivo, histórico de datas, sugestão de data sem trava para o planejador.
- Empresas separadas (Amil, RVD, LLT), cada uma com a sua doca. Quem sugeriu
  primeiro fica com o horário até a mesa responder.
- Relatório e dashboard de notas recebidas sem agendamento, com filtros de mês,
  dia e unidade (Hospital e Maternidade), e painel no fim do dashboard do operador.
- API de recebimento para sistemas externos, com chave própria.

## Pendente

- Reorganizar a exportação Excel do relatório sem agendamento: abas com tabelas
  formatadas, pizza e colunas em 3D, e a base total. Ainda não foi feito.
- Treinamento do sistema (HTML e PDF) com prints atualizados. Os prints atuais
  são antigos; faltam prints novos.
