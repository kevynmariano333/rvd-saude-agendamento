# Importação do histórico do Agiliza

O Agiliza era o sistema de recebimento de notas de uma empresa parceira e saiu
do ar. O que sobrou do acervo da RVD Saúde é um CSV com o histórico de
recebimento: 3.725 notas entre 28/01/2026 e 16/09/2026.

Este documento descreve o script `scripts/importar-agiliza.ts`, que traz esse
acervo para dentro do portal.

## Por que importar

Sem o acervo, todo fornecedor que entrar no portal vê uma tela em branco: o
relacionamento com a RVD começa do zero e nada do que foi entregue no primeiro
semestre existe para consulta. Com o acervo importado, cada empresa encontra o
próprio histórico assim que for aprovada.

## Como rodar

O script é autônomo: não é rota, não é serviço e não é chamado por nenhuma parte
do app. Ele fala direto com o banco.

```bash
# Simulação (padrão): lê, valida e conta. Não grava nada.
pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv

# Gravando de verdade
DATABASE_URL="mysql://usuario:senha@host:3306/banco" \
  pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv --confirmar

# Lotes menores, se a conexão for instável (padrão: 200 notas por transação)
pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv --confirmar --lote=50
```

A simulação é o padrão de propósito. É uma carga grande, feita uma vez, num
banco de produção que não tem tela nenhuma para desfazer o resultado — nenhuma
das telas de administração mostra os fornecedores criados aqui.

Sem `DATABASE_URL`, a simulação ainda roda: ela valida o arquivo inteiro e
relata, só não consegue dizer quantas notas já estariam no banco.

**Rode no mesmo ambiente do app** (por exemplo, o console do serviço no
provedor). A conexão é aberta exatamente como `server/db.ts` a abre, porque é
isso que define em que fuso o mysql2 grava as datas: rodar de uma máquina com
outro fuso colocaria o acervo deslocado em relação a tudo que o portal já
escreveu.

Faça um backup antes (`node scripts/backup-banco.mjs`).

## Rodar duas vezes é seguro

O script é idempotente por dois caminhos:

- **Fornecedores**: a conta de cada empresa nasce com `openId` derivado do CNPJ
  (`agiliza-<14 dígitos>`), e esse é o único índice único que sobra na tabela.
  Antes de criar, o script procura um fornecedor aprovado com aquele CNPJ e o
  reaproveita.
- **Notas**: antes de inserir, procura um agendamento com aquele
  `invoiceNumber` para aquele `supplierId`. Se existir, conta como "já
  existente" e segue.

Cada lote de notas entra numa transação junto com o histórico de status dela —
uma nota nunca fica sem a própria linha do tempo. Se a execução falhar no meio,
o que já entrou fica, e rodar de novo completa o resto sem duplicar.

## O que cada coluna do CSV vira no banco

| Coluna do CSV | Vai para | Observação |
| --- | --- | --- |
| Data de Criação | `appointments.createdAt` e o 1º evento do histórico | interpretada em America/Sao_Paulo |
| Último Status | `appointments.status` | `Concluída` → `completed`, `Recebida` → `received`, `Backlog` → `backlog` |
| Data do Último Status | `appointments.receivedAt` e o último evento do histórico | `receivedAt` fica nulo no backlog |
| Data de Agendamento | `appointments.scheduledFor` e o evento de agendamento | |
| Número da Nota | `appointments.invoiceNumber` | texto, para não perder zeros à esquerda |
| Número do Pedido | `appointments.purchaseOrder` | vários pedidos juntados por `, `; vazio vira nulo |
| CNPJ Fornecedor | `users.companyCnpj` (só dígitos) | define a qual empresa a nota pertence |
| Nome Fornecedor | `appointments.invoiceSupplierName` (linha a linha) e `users.name`/`users.companyName` (o nome da linha mais recente) | |
| Total de Linhas | texto em `appointments.notes` | **não** vai para `invoiceVolumeCount`: são itens da nota, não volumes |
| CNPJ Destino | `appointments.recipientCnpj` (só dígitos) | só quando é reconhecidamente da RVD |
| Descrição Destino | texto em `appointments.notes` | |

Além disso, cada nota importada recebe:

- `source: "importado"` — o valor criado na migração `0024` justamente para que o
  acervo seja reconhecível na tela do operador (aparece como "Importado") e
  filtrável nos números do painel. Sem ele, 3.721 notas antigas ficariam
  indistinguíveis da operação do dia.
- `serviceType: "Recebimento NF <número>"` — o campo é obrigatório e aparece como
  "Item recebido" no relatório consolidado; segue o mesmo formato curto que o
  portal já usa nos recebimentos sem agendamento.
- `notes` com a procedência, o status de origem, o destino informado e o total de
  linhas da nota.
- `appointmentStatusHistory` com a cadeia que o portal produziria:
  criação → agendamento → recebimento → conclusão (no backlog:
  criação → backlog), cada evento com a data do acervo e sem responsável — o
  diálogo mostra "Processo automático".

## O que **não** vem junto

O CSV não traz, e portanto ficam nulos (nunca zero, nunca string vazia):

- **XML da nota** — `xmlUrl`, `xmlStorageKey`, `xmlFileName`.
- **Valor da nota** — `invoiceTotalCents`. No painel, essas notas contam na
  quantidade recebida e somam R$ 0,00 no valor. Vale saber disso antes de
  comparar faturamento mês a mês a partir de março de 2026.
- **Quantidade de volumes** — `invoiceVolumeCount`.
- **Itens da nota** — `invoiceItemsJson`.
- **Chave de acesso e data de emissão** — `invoiceAccessKey`, `invoiceIssuedAt`.
- **Pré-nota e responsável** — `preNoteConfirmedAt`, `preNoteConfirmedBy`,
  `handledBy`.

Também não vêm conversas: nenhuma mensagem é criada para as notas importadas.

## Os fornecedores criados

Decisão do dono do sistema: cada CNPJ do acervo vira **um usuário** com perfil
`supplier`, `accessStatus` aprovado, **sem senha e sem e-mail** — ou seja, uma
conta que não consegue entrar. Ela existe só para segurar o histórico da
empresa. Quando o fornecedor de verdade se cadastrar com aquele CNPJ e for
aprovado, o agrupamento por empresa que o portal já faz mostra a ele o acervo
inteiro.

Duas consequências que a operação precisa saber **antes** da carga:

1. **Todo fornecedor do acervo passa a cair na fila de aprovação.** O portal só
   aprova na hora quem é o primeiro login do seu CNPJ. Como esses CNPJs passam a
   existir, os próximos cadastros dessas empresas ficam "em análise" esperando o
   operador. É o comportamento desenhado, mas muda a rotina no dia seguinte à
   importação.
2. **Essas contas não aparecem em nenhuma tela de administração.** A lista de
   equipe não mostra fornecedores e a fila de acessos só mostra pendentes.
   Corrigir nome ou CNPJ depois exige mexer no banco.

## Linhas que o script recusa

Linha recusada não entra e aparece no relatório final com número e motivo. No
arquivo entregue pela parceira são 4:

| Linha | Motivo |
| --- | --- |
| 1794 | CNPJ do fornecedor é o do próprio hospital (HSH): as colunas de fornecedor e destino vieram trocadas |
| 3012 | CNPJ `06.027.604/0021-20` reprova no dígito verificador (nome "oregan"; parece a raiz da OREGON com o sufixo do MSH colado) |
| 3463 | `63782500011` tem 11 dígitos e não dá para reconstruir a partir do arquivo (GLOBOMED) |
| 3469 | CNPJ do fornecedor é o do próprio MSH |

As duas recusas por CNPJ da RVD são de segurança, não de capricho: criar um
fornecedor com o CNPJ do hospital faria qualquer pessoa que se cadastrasse com
esse CNPJ — que é público — enxergar o acervo pelo agrupamento por empresa.

As quatro precisam de decisão de quem conhece as empresas. Depois de decidido, o
caminho é corrigir as linhas no CSV e rodar de novo: as notas já importadas são
reconhecidas e puladas.

## Consertos que o script faz sozinho, e avisa

- **CNPJ de fornecedor mutilado (18 linhas).** Vieram sem máscara e sem um zero
  do meio (`0164540900390` em vez de `01645409000390`). Completar com zero à
  esquerda inventaria uma empresa que não existe; o script reinsere um zero e só
  aceita quando o resultado é, sem ambiguidade, um CNPJ que já aparece no
  próprio arquivo. São 15 valores distintos, todos resolvidos assim — sem isso,
  15 empresas ganhariam uma conta fantasma e parte do histórico ficaria presa
  nela para sempre.
- **CNPJ de destino truncado.** Mesmo critério, mas comparando com os dois
  destinos reais da RVD (HSH `06.033.403/0001-13` e MSH `43.293.604/0021-20`).
  O que não bater com um destino conhecido é gravado como vazio e registrado em
  `notes` — melhor um destinatário em branco do que um CNPJ errado ao lado da
  palavra "Destinatário" numa tela que a operação usa como documento.
- **Nomes de fornecedor.** `&amp;` é decodificado, espaços e aspas soltas são
  removidos. Quando um CNPJ aparece com grafias diferentes (47 casos), a conta da
  empresa fica com **o nome da linha mais recente**, que é como a empresa se
  chamava por último. O nome de cada linha vai para a nota de qualquer jeito.
- **Linha do tempo fora de ordem.** 72 linhas têm agendamento anterior à
  criação (a maioria por 1 ou 2 segundos de relógio da origem; algumas por dias,
  porque o Agiliza migrou agendamentos antigos em 23/03/2026). As datas da nota
  entram como vieram; só os carimbos do histórico são forçados a não retroceder,
  senão a nota apareceria concluída antes de existir.

## Relatório final

Ao terminar, o script imprime quantas linhas leu, quantas importou (ou
importaria), quantas já existiam, quantas recusou — com a lista completa de
recusas — e quantos fornecedores criou ou reaproveitou. Os consertos acima saem
como avisos, com o número da linha.
