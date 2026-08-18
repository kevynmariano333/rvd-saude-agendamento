# Validação de recebimento, sugestões e atualização automática

Em 18 de agosto de 2026, a coluna `appointments.receivedAt` foi migrada para o banco de dados. Quando um Operador define uma nota como **Recebida**, o instante da confirmação é persistido e utilizado pelo painel do Operador, pelos detalhes da nota e pelo histórico do Fornecedor.

As sugestões do Fornecedor agora aceitam itens **Pendentes**, **Agendados** e em **Backlog**. No modal de agendamento, os campos de data e hora abrem vazios. A ação **Aceitar** apenas aplica a data e a hora sugeridas aos campos; a confirmação posterior efetiva o agendamento e registra a sugestão como aceita.

As consultas do portal foram configuradas para nova busca a cada cinco segundos, inclusive quando a aba estiver em segundo plano, e ao receber foco. Os dois painéis usam o mesmo cliente de consultas global, portanto recebem o mesmo ciclo de atualização. A suíte automatizada executou `pnpm check` e `pnpm test` com sucesso: **38 testes em 11 arquivos**, incluindo os testes de persistência da transição para Recebido, exibição de `receivedAt` e sincronização automática.
