# RVDlog+ — Manual do colaborador

Como o portal funciona do lado de quem trabalha na RVD: operador, planejamento e
administrador. O acesso do fornecedor e o da portaria têm fluxos próprios e
ficam de fora deste manual.

Este é o texto do manual. A versão em PDF, com as fotos de cada tela, é gerada a
partir daqui — quando a tela mudar, o texto muda aqui primeiro.

## Quem faz o quê

| Perfil | O que pode |
| --- | --- |
| **Operador** | Agenda, reagenda, recebe, conclui, rejeita e resgata. Cuida da fila do dia. |
| **Planejamento** | Sugere datas, marca urgência, trata o backlog e tira relatórios. Não confirma agendamento. |
| **Administrador** | Tudo do operador, mais acessos, empresas, importação, backup e segurança. |
| **Portaria** | Registra chegada, libera entrada e saída. Fora deste manual. |
| **Fornecedor** | Envia a nota, sugere data e acompanha. Vê apenas as notas da própria empresa. |

## 1. Entrar no portal

O portal tem portas separadas: fornecedor, operador e portaria. Quem trabalha na
RVD entra pela porta do **Operador** — é ela que abre a agenda, o backlog e os
relatórios. O planejamento entra por essa mesma porta; o que muda é o que ele
pode fazer depois de entrar.

- Abra o endereço do portal e escolha **Acesso Operador**.
- Entre com o seu e-mail e a sua senha.
- Esqueceu a senha? Use **Esqueci minha senha** na própria tela: chega um link no
  seu e-mail, e ele vale por tempo limitado.

> Cada pessoa tem o seu login. Login compartilhado tira do sistema a única coisa
> que ele sabe dizer depois: quem fez o quê.

## 2. Dashboard — o que é o dia de hoje

A primeira tela responde à pergunta da manhã: o que chega hoje, o que está
atrasado e o que ainda espera confirmação. Os números são atalhos — clicar em um
leva direto para a lista correspondente.

- **Chegam hoje**: notas com data confirmada para hoje.
- **Aguardando confirmação**: o fornecedor mandou, e ninguém cravou a data ainda.
- **Atrasadas**: passou do horário combinado e a nota não foi recebida.

## 3. Notas — a lista de tudo

É a tela onde o dia acontece. Cada linha é uma nota fiscal, com o fornecedor, o
destinatário, o número, o pedido de compra e a data. As abas de cima separam por
situação e mostram quantas notas esperam alguém em cada fila.

- Clique no título de uma coluna para ordenar por ela; clique de novo para inverter.
- Use a **busca** para achar por número da nota, pedido ou fornecedor.
- Em **Filtros**: período, destinatário, situação e fornecedor.
- A etiqueta **SERVIÇO** embaixo do fornecedor avisa que aquela nota não tem carga nem XML.

> A lista mostra 25 por página, mas ordenar e filtrar acontece no banco: a
> ordenação vale para o acervo inteiro, não só para a página que está na tela.

## 4. Pendente — a fila que trava o portão

Pendente é a nota que o fornecedor enviou e que ninguém confirmou ainda. É a fila
mais importante do dia: nota parada aqui vira caminhão parado no portão, porque o
motorista sai da transportadora achando que tem hora marcada.

- Trabalhe essa aba de cima para baixo, começando pelas urgentes.
- Se a data sugerida pelo fornecedor serve, aceitar é um clique.
- Se não serve, agende outra data — o fornecedor é avisado.

## 5. Urgência

Duas coisas marcam uma nota como urgente. A primeira é automática: pedido da
faixa 4000 é urgente por definição do ERP. A segunda é o planejamento marcando à
mão — para o caso que o ERP não sabe: estoque acabou, cirurgia antecipada.

- A marca aparece na linha, junto do status.
- Quando foi marcada à mão, o motivo aparece ao lado — e fica registrado quem marcou.
- Marcar à mão não substitui a regra do pedido: soma.

## 6. Agendar

Agendar é cravar dia e hora. Quando o fornecedor sugeriu uma data, ela aparece na
janela e pode ser aceita direto. Ao confirmar, o fornecedor recebe o aviso e a
nota passa para **Agendado**.

- Clique em **Agendar** na linha da nota.
- Aceite a sugestão do fornecedor ou escolha outro dia e horário.
- Confirme. A nota muda de situação e entra no calendário.

> Quem crava a data é o operador. O planejamento sugere; a confirmação é sempre
> do balcão.

## 7. Conversa com o fornecedor

Cada nota tem a sua própria conversa. Serve para o que antes ia por WhatsApp e se
perdia: "a carga atrasou", "manda a nota corrigida", "chega depois do almoço".

- O número no ícone é o total de mensagens da nota, e ele não some depois de lidas.
- Enquanto houver mensagem sem ler, o número fica vermelho.
- A conversa fica guardada com a nota — meses depois ainda dá para saber o que foi combinado.

## 8. Detalhes da nota

Abre tudo que veio no XML: itens, quantidades, valores, volumes, destinatário,
chave de acesso. E, ao lado, o que o pedido de compra esperava, segundo o SAP —
que é contra o que a nota se confere.

- Divergência de preço ou de quantidade aparece aqui, antes de a carga descer do caminhão.
- O histórico mostra cada mudança de data e de situação, com quem fez e quando.
- As anotações internas ficam nesta tela e o fornecedor nunca as vê.

## 9. DANFE e anexo

O clipe entrega o arquivo que o fornecedor enviou — XML na nota de mercadoria,
PDF na de serviço. O ícone ao lado desenha o **DANFE** daquela nota, no layout da
SEFAZ, com o código de barras da chave de acesso.

- O DANFE é gerado na hora, a partir do XML guardado: não depende de o fornecedor
  ter mandado por e-mail.
- O código de barras é o padrão que o leitor de mão lê.
- Nota de serviço não tem DANFE — NFS-e não tem layout único, cada prefeitura tem o seu.

> É documento de conferência interna. O que vale para o fisco é a autorização na
> SEFAZ, e a folha diz isso no rodapé.

## 10. Rejeitar

Rejeitar pede o motivo, escolhido de uma lista fechada: não compareceu, chegou
fora do horário, carga divergente, documento errado. Lista fechada porque motivo
digitado à mão vira trinta jeitos de escrever a mesma coisa, e aí não dá para
contar.

- Escolha o motivo; alguns pedem uma linha de explicação.
- A nota vai para **Rejeitado** com o motivo à vista na lista.
- Rejeitado não é fim: o botão **Resgatar** traz a nota de volta.

> É o que permite cobrar o fornecedor com dado — "você faltou três vezes neste
> mês" — em vez de com memória.

## 11. Receber e concluir

Quando a carga chega e é conferida, a nota é **recebida**. Quando é lançada no
SAP, é **concluída** — e o portal pede o número do MIRO, que é o elo entre o
recebimento daqui e o financeiro de lá.

- **Receber**: a carga entrou e foi conferida.
- **Concluir**: informe o número do MIRO do lançamento.
- Não fechou? Mande para o backlog com o motivo, em vez de concluir no escuro.

## 12. Calendário

A mesma agenda, vista por dia. Serve para enxergar o acúmulo antes de ele
acontecer: três caminhões marcados às 10h e a tarde inteira vazia é um problema
que só o calendário mostra.

## 13. Backlog — o que não fechou

Quando o recebimento não fecha, a nota vai para o backlog com o motivo:
divergência de preço, quantidade, nota sem pedido, item a mais. É a fila do
planejamento, e cada linha parada aqui é dinheiro parado.

- O motivo aparece na primeira coluna — é a primeira coisa que o planejamento precisa ler.
- A tratativa é registrada na própria nota: cotação, pedido memorizado, documento
  de entrada e de saída no HIS.
- Resolvido, a nota volta para o fluxo normal.

> É esse registro que permite dizer, meses depois, como aquela nota foi destravada.

Os filtros do backlog cobrem fornecedor, destinatário, motivo e período de
entrada — e o que estiver na tela sai em Excel do jeito que está filtrado.

## 14. Relatórios

Três visões: **consolidado** (uma linha por nota), **detalhado** (item a item) e
**backlog**. Todas filtram por período, situação, fornecedor e destinatário, e
todas saem em Excel.

- Escolha a visão, ajuste os filtros e clique em **Carregar relatório**.
- **Exportar Excel** leva o acervo inteiro do filtro, e não só a página da tela.
- As colunas saem na ordem certa, com largura que cabe o conteúdo.

O **relatório de fornecedores** é à parte: todos os fornecedores do sistema, com
login e sem, com contato e quantas notas cada um já trouxe.

## 15. Notas de serviço e recebimento avulso

Nem toda nota passa pelo fornecedor. Nota de serviço e recebimento que chegou sem
agendamento entram à mão, com o documento anexado.

- Nota de serviço: sem carga e sem XML — ganha a etiqueta **SERVIÇO** na lista.
- Recebimento avulso: a carga chegou sem agendamento e precisa existir no sistema mesmo assim.

## 16. Acessos — aprovar quem se cadastrou

Cadastro novo de fornecedor cai nesta fila e não entra sozinho. Aprovar dispara um
e-mail dizendo que o login está valendo — quem se cadastrou não fica esperando no
escuro, e é isso que evita o fornecedor mandar carga sem agendar.

- Confira o CNPJ e o nome da empresa antes de liberar.
- Aprovar manda o e-mail automaticamente.
- Dá para bloquear um acesso depois, e reativar — o e-mail avisa nos dois casos.

## 17. Quadro do sistema

Na mesma tela, embaixo: o estado do backup, o do e-mail e o que ainda está aberto
na segurança — respondido pelo servidor que está no ar, e não por um documento
que alguém escreveu um dia.

- **Backup do banco**: quando foi o último e o que ele levou. O botão gera um agora.
- **Segurança**: o que está resolvido fica verde; o que falta vem com o passo escrito do lado.
- **Cartaz da portaria**: o PDF com o QR para imprimir e colar no portão.

> O backup roda sozinho de madrugada e vai para outro provedor. Se ele falhar
> duas noites seguidas, o administrador recebe um e-mail.

## 18. Empresas

Vários logins podem ser da mesma empresa — o vendedor, o faturamento, a
transportadora. Agrupando-os numa empresa, cada pessoa passa a ver as notas da
empresa inteira, e não só as que ela mesma enviou.

## 19. Importar acervo

O relatório do Agiliza entra por aqui. Nota que já existe é **atualizada**, e não
duplicada; nota que nasceu no portal nunca é sobrescrita pela importação. O resumo
diz quantas entraram, quantas foram atualizadas e quantas foram ignoradas.

## 20. O que muda no Planejamento

O planejador entra pela mesma porta e vê a mesma lista — com outras ações. Ele não
crava data: sugere. A confirmação é sempre do operador.

- **Sugerir data** no lugar de Agendar. Ao sugerir, ele vê as outras notas daquele
  mesmo fornecedor que já estão agendadas — é o que evita marcar dois caminhões da
  mesma empresa no mesmo dia sem perceber.
- Marcar **urgência** com o motivo.
- Tratar o **backlog** e tirar os **relatórios**.

## Palavras que aparecem no portal

| Palavra | O que quer dizer |
| --- | --- |
| **Pré-nota** | A conferência do documento antes da carga. Confirmar é um clique na linha; clicar de novo desfaz, e as duas ações ficam no histórico. |
| **Backlog** | A nota que não fechou no recebimento e voltou para o planejamento resolver. |
| **MIRO** | O número do lançamento da nota no SAP. É o elo entre o recebimento aqui e o financeiro lá. |
| **DANFE** | A folha impressa que representa a nota eletrônica. O que vale para o fisco é a autorização na SEFAZ. |
| **Pedido 4000** | Faixa de pedido do ERP que marca a nota como urgente automaticamente. |
| **Destinatário** | A unidade que recebe: HSH (Hospital) ou MSH (Maternidade). Vem do CNPJ na nota. |
