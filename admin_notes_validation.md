# Validação da administração de notas

## Preparação de sessão

Em 18 de agosto de 2026, foi confirmada uma sessão ativa de Fornecedor, que não exibe nenhuma área de administração de notas. O menu de conta ofereceu apenas a ação de encerrar sessão, preservando a separação entre os perfis antes da validação administrativa.

Após encerrar a sessão do Fornecedor, a tela de acesso foi exibida novamente. O perfil Operador foi selecionado para autenticar o usuário de demonstração que possui a função de Administrador.

O acesso `admin` / `admin` foi autenticado com o perfil de Administrador. A navegação do painel exibiu a aba adicional **Administrar notas**, enquanto essa aba não estava disponível na sessão de Fornecedor.

Ao abrir `/operador/notas`, o painel apresentou o aviso de exclusão definitiva e a tabela administrativa sem registros. A lista também ficou vazia no painel operacional, confirmando que as notas nº 5676 não permanecem disponíveis.

## Notas removidas

As duas notas de teste de número **5676** foram removidas do banco de dados a pedido do usuário. A conferência posterior retornou **0** registros com esse número.
