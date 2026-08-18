# Revisão de acesso de fornecedor

**Data:** 18 de agosto de 2026.

O cadastro de fornecedor foi revisado visualmente sem criar dados persistentes. A tela apresenta os campos **Nome da empresa / razão social**, **CNPJ**, **E-mail**, **Senha** e **Confirmar senha**, além do botão de criação da conta. O formulário preserva a identidade visual RVD e não apresenta qualquer referência a recuperação de senha.

| Verificação técnica | Resultado |
|---|---|
| Cadastro empresarial | Procedure `auth.registerSupplier` valida e persiste empresa, CNPJ normalizado, e-mail e senha. |
| CNPJ e e-mail | São verificados para impedir contas duplicadas. |
| Login | Novos fornecedores passam a se cadastrar antes de entrar. |
| Logout | A barra superior limpa cookie, cache de autenticação e sessão espelhada antes de redirecionar ao login. |
| Testes | Compilação TypeScript e 26 testes automatizados aprovados. |

A confirmação manual no navegador — encerrar a sessão e criar uma conta real de fornecedor — foi adiada pelo usuário para um momento posterior. Nenhuma conta temporária foi criada para essa validação.
