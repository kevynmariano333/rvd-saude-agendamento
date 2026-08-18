# Verificação visual da central do operador

Na verificação de 18 de agosto de 2026, a aba de calendário apresentou corretamente a grade semanal com colunas por dia e faixas de horário de 06:00 a 18:00. A tela de Operador retornou inicialmente uma captura sem conteúdo durante o carregamento de autenticação, mas a captura posterior exibiu corretamente a central com as abas de status, os contadores e a tabela operacional. A versão móvel também manteve as ações rápidas, as abas em múltiplas linhas e a área de tabela com rolagem horizontal. Os dados temporários usados no ensaio foram removidos ao final.

Na revisão final, a central do operador apresentou estado vazio orientativo, abas de status, filtros rápidos e ação de agendamentos do dia. O calendário manteve a matriz semanal com horários de 06:00 a 18:00 e navegação entre semanas. Os relatórios exibiram indicadores, distribuição por status, fornecedores e a tabela de dados fiscais. Como os dados temporários foram removidos, as capturas exibem os estados vazios esperados.

O carregamento foi atualizado para utilizar um caminhão RVD estilizado, com o logo da RVD Saúde em tamanho discreto no veículo, exibido enquanto o perfil e os dados da central do operador ou do calendário são inicializados.

Os filtros fiscais agora possuem cobertura de procedure para número da nota, fornecedor e CNPJ destinatário, além de teste de normalização do CNPJ. A validação integrada do reagendamento confirmou que a consulta de histórico expõe `previousScheduledFor` e `nextScheduledFor` com a data/hora anterior e a nova data/hora; todos os registros temporários foram removidos após o ensaio.

A navegação superior foi validada em desktop com Dashboard, Agendamentos, Calendário e Relatórios organizados em uma barra horizontal ampla. O cabeçalho exibiu marca RVD, notificação, identificação do usuário logado e seu perfil operacional. O dashboard e a central de agendamentos renderizaram suas abas ativas e estados vazios sem erro de layout.

A visualização móvel confirmou a marca, o botão de menu e o acesso de perfil no cabeçalho, com os controles e abas da central preservados em múltiplas linhas. As rotas de operador Dashboard, Agendamentos, Calendário e Relatórios foram capturadas com a aba correspondente ativa na navegação superior.

O recebimento sem agendamento foi validado por procedimento e integração: um operador enviou um XML temporário, a nota foi criada com status **Recebido**, com dados fiscais extraídos, XML associado e evento de auditoria específico. A conta e o recebimento usados no ensaio foram removidos após a confirmação.

Uma captura autenticada independente confirmou a navegação superior do perfil **Fornecedor**, com identificação de perfil, opções Meus agendamentos e Sugestões, formulário de solicitação e histórico de solicitações. Os estados Agendado, Recebido, Concluído, Backlog e Rejeitado foram validados no escopo de fornecedor por fluxo autenticado e permanecem representados pelo mesmo conjunto de rótulos de status do portal.

Uma segunda captura autenticada do fornecedor exibiu simultaneamente os cinco estados no histórico: **Agendado**, **Recebido**, **Concluído**, **Backlog** e **Rejeitado**. Os registros foram criados exclusivamente para a comprovação visual e serão removidos após este registro.

A evidência foi registrada antes da limpeza e os perfis, agendamentos, sessões auxiliares e arquivos temporários usados na validação foram removidos ou restaurados em seguida.
