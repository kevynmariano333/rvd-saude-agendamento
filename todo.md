# Project TODO

- [x] Extrair a paleta estritamente do logo RVD Saúde fornecido e disponibilizá-lo como ativo estático.
- [x] Modelar usuários por perfil (operador e fornecedor) e agendamentos com histórico de status.
- [x] Implementar sessão persistente e regras de acesso separadas para operador e fornecedor.
- [x] Criar tela de login RVD Saúde Agendamento com seleção explícita de perfil.
- [x] Criar painel do operador com indicadores, listagem, filtros por data/status e ações de aprovar, rejeitar e concluir.
- [x] Criar painel do fornecedor com histórico próprio e formulário de solicitação de agendamento.
- [x] Implementar formulário de agendamento com data, horário, tipo de serviço e observações.
- [x] Aplicar identidade visual sofisticada usando somente os tons extraídos do logo fornecido.
- [x] Cobrir regras essenciais de agendamento e autorização com testes Vitest.
- [x] Verificar visual desktop e mobile, fluxos principais e ausência de erros de execução.
- [x] Adicionar histórico de status auditável com usuário responsável e data de cada transição.
- [x] Criar testes Vitest para as procedures de criação, listagem e autorização de agendamentos.
- [x] Validar no navegador os fluxos de login, solicitação, aprovação, rejeição e conclusão sem dados persistentes de demonstração.
- [x] Validar ponta a ponta o cenário de rejeição, incluindo trilha de histórico e remoção dos dados temporários.
- [x] Registrar a verificação dos fluxos por perfil na interface autenticada, incluindo solicitação, aprovação, rejeição e conclusão.
- [x] Expor e validar a consulta auditável do histórico de status com responsável operacional.
- [x] Preparar uma validação interativa por perfil no navegador sem manter dados temporários após o teste.
