# Evidência de validação no navegador — acessos de teste

## Operador

Em 18 de agosto de 2026, a tela de login foi aberta no navegador. Ao selecionar **Operador**, a interface confirmou o perfil ativo e exibiu o rótulo **Novo cadastro de operador**. A tela também apresentou a instrução de acesso de teste: `admin` / `admin`.

O formulário foi preenchido com `admin` / `admin`. Após o envio, o navegador confirmou a abertura do painel do Operador, exibindo o usuário **Operador de Teste RVD Saúde**, a identificação de perfil **Operador** e as abas de gestão **Dashboard**, **Agendamentos**, **Calendário** e **Relatórios**.

O menu de conta confirmou o e-mail técnico do acesso de demonstração (`teste.operador@rvdsaude.local`) e disponibilizou a ação **Encerrar sessão**, utilizada para seguir com a validação do outro perfil.

> O fluxo acima valida o **acesso de demonstração**. A validação de uma conta de Operador real e não demo permanece registrada como etapa independente.

## Fornecedor

A sessão do Operador foi encerrada com sucesso, retornando à tela de acesso. Em seguida, o perfil **Fornecedor** foi selecionado, mantendo visíveis as instruções `admin` / `admin` para o segundo teste.

O formulário foi preenchido com `admin` / `admin`. Após o envio, o navegador confirmou a abertura do painel do Fornecedor em `/fornecedor`, exibindo o usuário **Fornecedor de Teste RVD Saúde**, a identificação de perfil **Fornecedor**, as abas **Meus agendamentos** e **Sugestões**, além do formulário de nova solicitação.

O menu de conta do Fornecedor de demonstração confirmou a opção **Encerrar sessão**, preparando o navegador para a validação isolada de um cadastro não demo.

Após encerrar essa sessão, o perfil **Operador** foi selecionado na tela de acesso. O botão **Novo cadastro de operador** foi exibido corretamente para a criação controlada de uma conta não demonstrativa, que será usada depois como conta existente no teste de login.

A conta não demonstrativa **Operador de Validação RVD** foi cadastrada pelo formulário de Operador. O navegador exibiu a confirmação de cadastro e abriu o painel de Operador. Essa conta será desconectada e autenticada novamente em uma sessão subsequente para validar o login de uma conta existente sem nova criação.

No painel, o menu da conta exibiu o nome **Operador de Validação RVD**, o perfil **Operador** e o e-mail da conta recém-criada. A opção **Encerrar sessão** foi disponibilizada para iniciar uma sessão nova antes do teste de login existente.

A sessão foi encerrada e o perfil Operador foi selecionado novamente na tela de acesso. A próxima autenticação usará o e-mail e a senha da conta já persistida, sem acionar o fluxo de cadastro e sem usar o atalho de demonstração `admin/admin`.

Em uma nova sessão, o formulário de login foi preenchido com as credenciais da conta já persistida **Operador de Validação RVD**. O navegador abriu novamente `/operador` e exibiu o nome e o perfil corretos. Esse resultado comprova o ciclo de cadastro seguido de novo login para uma conta não demo; a validação específica de uma conta que já existia antes desta sessão permanece pendente.

Após esse teste, a sessão de Operador foi encerrada e a tela de login foi apresentada novamente com o perfil Fornecedor selecionado. Isso separa o próximo cadastro de Fornecedor da sessão anterior.

O formulário de Fornecedor foi preenchido com razão social, CNPJ, e-mail e senha próprios para validação. Após o envio, o navegador informou **Cadastro realizado com sucesso** e apresentou o painel do usuário **Fornecedor de Validação RVD** em `/fornecedor`, com as abas **Meus agendamentos** e **Sugestões**.

No menu da conta, o painel confirmou a razão social **Fornecedor de Validação RVD**, o perfil **Fornecedor** e o e-mail associado ao cadastro. A ação **Encerrar sessão** foi disponibilizada para o teste de login em sessão independente.

A sessão do novo Fornecedor foi encerrada e, na tela de acesso, as credenciais persistidas foram preenchidas com o perfil **Fornecedor** já selecionado. O próximo envio validará a abertura do painel sem criação de conta adicional.

O login da conta já cadastrada foi enviado em uma nova sessão. O navegador abriu `/fornecedor` e mostrou novamente **Fornecedor de Validação RVD**, o perfil **Fornecedor**, suas abas e o formulário de solicitações. O cadastro, o novo login e a abertura do painel do Fornecedor foram, assim, validados em sessão isolada.
