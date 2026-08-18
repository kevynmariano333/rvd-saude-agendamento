# Revisão visual — Detalhes e histórico de agendamento

**Data:** 18 de agosto de 2026.

O painel de detalhes foi revisado em pré-visualização antes da remoção dos dados temporários de validação. A janela aberta exibiu, com a identidade visual RVD, o título **Detalhes do agendamento**, botão **Histórico de datas**, os cartões de status, data e horário, informações da nota, participantes, chave de acesso e a seção de itens. O modal ficou opaco e legível sobre a tabela escurecida pelo overlay.

| Controle na tabela | Comportamento implementado |
|---|---|
| Ícone de documento | Abre o painel de detalhes da nota e do agendamento, sem redirecionar diretamente ao XML. |
| Ícone de histórico | Abre o modal **Histórico de datas** com as sugestões e eventos reais do agendamento. |
| Botão de histórico no detalhe | Abre o mesmo modal de histórico de datas. |

O histórico usa a consulta auditável de status e a listagem de sugestões filtrada pelo ID do agendamento. Assim, datas de sugestão, agendamento e reagendamento são apresentadas quando existirem no registro, sem dados fictícios persistidos.
