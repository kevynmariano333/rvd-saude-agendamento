# Roteiro de apresentação — Portal de Agendamento RVD Saúde

Roteiro para gravar um vídeo de 12 minutos (ou apresentar ao vivo) mostrando o
**módulo de agendamento**. A Portaria e a Operação de pátio ficam de fora de
propósito — são outro assunto e dobrariam o tempo.

O texto em _itálico_ é o que você fala. O texto em `código` é o que você clica.
Os tempos são acumulados, para você saber se está atrasado.

---

## Antes de gravar

**Meia hora antes, não na hora.** Demo que trava é demo que não convence.

### Preparar o navegador

- [ ] Zoom em **100%** (Ctrl+0). Zoom alto corta colunas da tabela.
- [ ] Feche as outras abas e esconda a barra de favoritos (Ctrl+Shift+B).
- [ ] Tela em **1920×1080** se puder. É o que o vídeo vai ter.
- [ ] Desative notificações do Windows: **Iniciar → Configurações → Sistema →
      Assistente de Foco → Somente alarmes**. Nada pior que um pop-up do
      WhatsApp no meio da gravação.

### Abrir três janelas, uma por perfil

Isso evita sair e entrar o tempo todo, que é o que mais consome tempo numa demo.

| Janela | Como abrir | Entrar como |
|---|---|---|
| 1 — Fornecedor | Janela anônima (Ctrl+Shift+N) | Acesso Fornecedor |
| 2 — Operador | Janela normal | Acesso Operador |
| 3 — Planejador | Outra janela anônima | Acesso Operador, com a conta de planejador |

Alterne entre elas com **Alt+Tab**. Deixe as três já logadas e na tela certa
antes de apertar o gravar.

### Preparar as notas

Estão em `docs/demonstracao/`: quatro XMLs fictícios de nota fiscal, prontos
para enviar pela tela do fornecedor.

- [ ] Envie **três** antes de gravar (NF 8842, 20455 e 1503), para a tela do
      operador já ter movimento.
- [ ] Agende uma delas e marque como **Recebida**, para ter o que concluir.
- [ ] Guarde a **NF 10071** para enviar ao vivo durante o vídeo.
- [ ] Deixe uma nota já **Concluída** de antes, para a aba Concluído não estar
      vazia.

> **Atenção:** se você gravar no sistema de produção, essas notas entram no
> banco de verdade. Os fornecedores são inventados, então dá para achá-las
> depois pelo nome e apagar em **Administrar notas**. Decida antes se quer
> gravar em produção ou não.

### Gravar

Windows, sem instalar nada:

- **Xbox Game Bar** — `Win+G`, botão de gravar, ou direto `Win+Alt+R` para
  começar e parar. O arquivo cai em `Vídeos\Capturas`.
- **PowerPoint** — `Inserir → Gravação de Tela`. Grava e já deixa o vídeo dentro
  do slide, se a apresentação for em PowerPoint.

Grave **em blocos**, um por seção deste roteiro. É muito mais fácil regravar 40
segundos do que 12 minutos, e dá para juntar depois no aplicativo **Fotos** do
Windows (Editor de Vídeo).

---

## Bloco 1 — Abertura (0:00 → 0:40)

**Tela:** página inicial do portal, antes do login.

> _"Bom dia. Vou mostrar o Portal de Agendamento da RVD Saúde: o sistema que
> organiza o recebimento de notas fiscais dos nossos fornecedores, do momento em
> que o fornecedor envia a nota até o lançamento no SAP."_

> _"Antes dele, o agendamento era feito por e-mail e planilha. A nota chegava
> sem aviso, ninguém sabia o que ia chegar no dia seguinte, e conferir o que foi
> recebido contra o que foi lançado era uma conferência manual, nota por nota."_

`Passe o mouse pelos três cartões de acesso` — Fornecedor, Operador, Portaria.

> _"O sistema tem três portas de entrada. Hoje vou mostrar a do fornecedor e a
> do operador, que é onde o agendamento acontece."_

---

## Bloco 2 — O fornecedor envia a nota (0:40 → 3:00)

**Tela:** janela 1, já logada como fornecedor.

> _"Esta é a tela do fornecedor. Ele não liga, não manda e-mail: ele envia a nota
> aqui."_

1. `Clique em "Escolher arquivo"` e selecione **NF-10071-cirurgica-ponta-verde.xml**.

   > _"Ele anexa o XML da própria nota fiscal — o mesmo arquivo que o sistema
   > dele já emite. O portal lê o XML e extrai tudo: número da nota, fornecedor,
   > CNPJ do destinatário, itens, valor, quantidade de volumes. Ninguém digita
   > esses dados, então não tem erro de digitação."_

2. `Preencha o Pedido de compra` com **4504748409**.

   > _"O pedido de compra é obrigatório. É por ele que o operador liga o
   > recebimento à compra que o originou — e é a informação que o XML nem sempre
   > traz, por isso pedimos aqui."_

3. `Preencha a sugestão de data e hora` — escolha amanhã, 09:00 — e a observação:
   _"Entrega com caminhão truck, precisamos de doca."_

   > _"O fornecedor pode sugerir uma data. Não é ele quem agenda: é uma
   > sugestão, que o operador pode aceitar com um clique."_

4. `Clique em "Enviar agendamento"`.

5. `Role até o histórico à direita.`

   > _"E aqui ele acompanha tudo o que enviou, com o status e a próxima etapa de
   > cada nota. Ele não precisa ligar para perguntar 'e a minha nota?' —
   > está na tela."_

6. `Clique em "Conversar"` em uma nota.

   > _"E cada nota tem a sua conversa. A dúvida sobre uma entrega fica junto da
   > entrega, e não perdida numa caixa de e-mail."_

   `Feche a conversa.`

**Ponto importante para falar aqui:**

> _"Cada fornecedor só enxerga as notas do próprio CNPJ. Se a empresa tiver
> vários logins, eles compartilham as notas da empresa — e ninguém vê as notas de
> outro fornecedor."_

---

## Bloco 3 — O operador recebe e agenda (3:00 → 6:30)

**Tela:** `Alt+Tab` para a janela 2, no **Dashboard**.

> _"Do outro lado, o operador. Ele abre no painel."_

1. `Aponte os três cartões do topo.`

   > _"Pendentes de agendamento, agendadas e recebidas — com a quantidade de
   > notas e o valor. Ele sabe em trinta segundos o tamanho do que tem pela
   > frente."_

2. `Aponte o gráfico de recebimentos.`

   > _"O volume de recebimentos por dia, e dá para virar para a visão por mês."_
   `Clique em "Por mês", depois volte para "Por dia".`

3. `Aponte "Top fornecedores" e "Tempo médio de espera".`

   > _"Quem mais entrega, e quanto tempo em média uma nota espera para ser
   > agendada. Esse número é o nosso indicador de serviço."_

4. `Clique em "Agendamentos" no menu.`

   > _"Aqui está a operação do dia."_

5. `Percorra as abas: Todos, Pendente, Agendado, Recebido, Concluído, Backlog,
   Rejeitado.` Pare em **Pendente**.

   > _"As notas separadas por etapa. Repare no contador em Pendente: é o que
   > está esperando decisão."_

6. `Clique em "Hoje" e depois "Amanhã"` no atalho do topo. Volte para **Todos**.

   > _"E o atalho de hoje e amanhã, que é o que ele mais usa: o que chega hoje e
   > o que chega amanhã."_

7. `Abra "Filtros"` e mostre os campos (nota, fornecedor, CNPJ, data).
   `Feche os filtros.`

8. Na nota que o fornecedor acabou de enviar, `clique no ícone de detalhes`
   (a folha).

   > _"Este é o detalhamento da nota, tudo lido do XML: número, pedido, volumes,
   > chave de acesso, os itens com quantidade e valor unitário, e o valor total."_

   `Feche o detalhamento.`

9. `Clique em "Agendar"`.

   > _"E aqui está a sugestão que o fornecedor mandou."_
   `Clique em "Aceitar"` na sugestão.
   > _"Um clique e a data dele entra no formulário."_

   `Aponte o painel da direita.`
   > _"E do lado, as outras notas já agendadas desse mesmo fornecedor — para a
   > gente agrupar entregas na mesma janela em vez de trazer o caminhão dele três
   > vezes na semana."_

10. `Clique em "Confirmar agendamento"`.

    > _"Pronto. A nota está agendada, e o fornecedor já vê a data na tela dele."_

11. `Alt+Tab para a janela 1 (fornecedor), atualize a página (F5).`

    > _"Olha lá: confirmado, com data e hora."_

    `Clique no botão do comprovante.`
    > _"E ele ainda tira um comprovante em PDF para o motorista levar. O
    > comprovante tem um código de validação: na portaria dá para conferir se
    > aquele papel é legítimo."_

---

## Bloco 4 — O dia da entrega: receber, concluir e o SAP (6:30 → 9:00)

**Tela:** janela 2 (operador), aba **Agendado**.

> _"No dia da entrega, o caminhão chega e a carga é conferida."_

1. `Clique em "Recebido"` numa nota agendada.

   > _"A nota passa para Recebida, com a hora exata do recebimento registrada."_

2. `Vá para a aba "Recebido"` e `clique em "Concluir"`.

   > _"E aqui está a parte que amarra o sistema com o financeiro."_

3. `Mostre o diálogo, com as duas opções lado a lado.`

   > _"Fechar um recebimento tem dois desfechos possíveis. Ou deu certo — e aí o
   > sistema exige o número MIRO, que é o lançamento da nota no SAP."_

   `Digite um MIRO errado, com 8 dígitos, e clique em confirmar.`
   > _"Tem que ter exatamente dez dígitos. O sistema não deixa passar."_

   `Corrija para 5105101642 e clique em "Confirmar finalização".`

   > _"Pedimos o MIRO neste momento porque é o único momento em que a pessoa tem
   > o número na tela do SAP. Depois a nota sai da lista e ninguém volta para
   > preencher."_

4. `Vá para a aba "Concluído"` e `aponte o MIRO embaixo do pedido`.

   > _"E o MIRO acompanha a nota daqui para a frente. Conferir o portal contra o
   > SAP deixou de ser nota por nota, na mão."_

5. `Volte para "Recebido", clique em "Concluir" em outra nota e escolha
   "Problema / Backlog".`

   > _"E quando não deu certo? Divergência de volume, nota retida na conferência.
   > A gente não conclui no escuro: a nota vai para o Backlog com o motivo."_

   `Escreva "Divergência de volumes: chegaram 6 de 8." e confirme.`

6. `Clique na aba "Backlog"`.

   > _"Ela fica aqui, visível, esperando ser reagendada. Não some."_
   `Aponte o botão "Reagendar".`

---

## Bloco 5 — Calendário e relatórios (9:00 → 10:30)

1. `Clique em "Calendário" no menu.`

   > _"A semana inteira numa tela. É com isso que a gente planeja a doca: dá para
   > ver o dia que está carregado e o dia que está vazio antes de marcar."_

   `Navegue uma semana com "Próxima" e volte.`

2. `Clique em "Relatórios".`

   > _"E o relatório, que é o que sai do sistema para a gestão."_

   `Aponte os filtros: período de agendamento, período de recebimento, status,
   fornecedor, CNPJ.`

   `Clique em "Carregar relatório".`

   > _"Consolidado, uma linha por nota — ou detalhado, item a item."_
   `Alterne entre "Consolidado" e "Detalhado".`

   `Clique em "Exportar Excel".`

   > _"E exporta para Excel com um clique. Repare na coluna Número MIRO: é essa
   > coluna que fecha a conferência com o SAP."_

---

## Bloco 6 — O perfil de Planejador (10:30 → 11:30)

**Tela:** `Alt+Tab` para a janela 3.

> _"Agora uma coisa que acabamos de entregar. Planejar a semana e se comprometer
> com o fornecedor são trabalhos diferentes, e até agora o sistema só tinha o
> segundo."_

1. `Aponte o menu.`

   > _"Este é o perfil de Planejador. Ele tem quatro telas: painel,
   > agendamentos, calendário e relatórios. Nada de pátio, nada de
   > administração."_

2. `Clique em "Agendamentos" e aponte o botão da nota pendente.`

   > _"E repare no botão: onde o operador vê 'Agendar', ele vê 'Sugerir data'."_

3. `Clique em "Sugerir data"`, escolha uma data e confirme.

   > _"Ele propõe. Quem confirma é o operador, porque a data é um compromisso com
   > o fornecedor e alguém tem que responder pela doca."_

4. `Alt+Tab para a janela 2 (operador), abra "Agendar" na mesma nota.`

   > _"E a sugestão dele chega exatamente onde o operador já olha, identificada:
   > sugestão do planejador."_

5. `Volte à janela 3 e mostre a aba Recebido, com o botão Concluir.`

   > _"O que ele faz por inteiro é acompanhar a nota até o fim: receber e
   > concluir. Um perfil que planeja a entrega mas não pode registrar que ela
   > chegou devolveria tudo para o operador no último passo."_

---

## Bloco 7 — Administração e segurança (11:30 → 12:20)

**Tela:** janela 2, com conta de administrador.

1. `Abra o menu da conta → "Acessos".`

   > _"Nenhum cadastro entra sozinho. Todo cadastro novo nasce pendente e espera
   > aprovação — inclusive os internos. Aqui eu aprovo, recuso, defino o perfil
   > de cada pessoa ou bloqueio um acesso."_

   `Aponte os botões de perfil: Administrador, Operador, Planejador, Portaria.`

2. `Role até o cartão "Backup do banco".`

   > _"E um backup do banco inteiro a um clique, gravado em outro provedor — não
   > adianta guardar a cópia do lado do original."_

   `Clique em "Gerar backup agora"` e mostre o resultado.

3. `Troque o tema no menu da conta.`

   > _"O sistema tem tema claro e escuro, e funciona no celular — que é onde o
   > pessoal da operação normalmente está."_

---

## Bloco 8 — Fechamento (12:20 → 13:00)

**Tela:** volte para o Dashboard.

> _"Resumindo o que o sistema resolve:"_

> _"O fornecedor envia a nota e acompanha sozinho, sem ligar para ninguém."_

> _"A gente sabe com antecedência o que chega, e planeja a doca em vez de
> reagir ao caminhão parado no portão."_

> _"Nada se conclui sem o lançamento no SAP, então a conferência entre o
> recebimento e o financeiro é automática."_

> _"E o que trava não some: fica no Backlog, com o motivo, até ser resolvido."_

> _"Obrigado."_

---

## Se o tempo apertar

Corte nesta ordem, que é da menor para a maior perda:

1. **Bloco 7 inteiro** (administração) — economiza 50s.
2. **Calendário** no Bloco 5 — economiza 30s. Mantenha o relatório.
3. **O comprovante em PDF** no Bloco 3 — economiza 25s.
4. **O gráfico e o Top fornecedores** no Bloco 3 — economiza 40s.

Nunca corte: o envio da nota (Bloco 2), o agendamento com a sugestão (Bloco 3) e
o MIRO (Bloco 4). São os três momentos que explicam por que o sistema existe.

## Se sobrar tempo

- Mostre o **Recebimento sem agendamento**: a nota que chega sem aviso ainda
  entra no sistema, em vez de ficar num caderno.
- Mostre a **pré-nota** (o ícone da prancheta) e a **confirmação** dela.
- Mostre o **histórico de datas** de uma nota reagendada: quem mudou, quando e
  de qual data para qual.

## Perguntas que provavelmente vão te fazer

**"E se o fornecedor não usar o portal?"**
O operador registra pelo botão **Recebimento sem agendamento**, com o mesmo XML.
A nota entra no sistema do mesmo jeito.

**"Quem pode ver os dados de um fornecedor?"**
Só ele e a equipe interna. O recorte por CNPJ é aplicado no servidor, em toda
consulta — não é um campo escondido na tela.

**"Onde isso está hospedado?"**
Aplicação e banco no Railway, arquivos no Cloudflare R2, código no GitHub. Está
tudo descrito no `ARQUITETURA.md`.

**"Quanto custa?"**
Railway e R2, nas faixas de uso atuais. Sem licença por usuário.

**"E se cair?"**
O backup do banco é gerado a um clique e fica em outro provedor. O código está
todo no GitHub, então subir em outro lugar é questão de horas, não de recomeçar.
