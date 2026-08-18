# Revisão de acesso por perfil

**Data:** 18 de agosto de 2026.

Foi confirmada visualmente a rota inicial sem sessão local: a aplicação mostra a tela **Bem-vindo(a)** com seleção de **Operador** e **Fornecedor**, campos de e-mail e senha, e o atalho **Fornecedor novo? Faça seu cadastro**. Esse atalho é exclusivo do fornecedor; não existe cadastro novo para operador.

| Fluxo | Resultado |
|---|---|
| Encerrar sessão | A sessão local, o cache de autenticação e o token espelhado são limpos antes do retorno ao login. |
| Operador existente | A tela oferece login com e-mail e senha previamente configurados, sem fluxo de criação de operador. |
| Fornecedor existente | A mesma tela permite o login por e-mail e senha cadastrados. |
| Fornecedor novo | O atalho abre o cadastro com empresa, CNPJ, e-mail, senha e confirmação. |
| Validação técnica | Compilação TypeScript e 26 testes automatizados aprovados. |

A automação isolada de login completo foi bloqueada pelo portal externo de autenticação antes de chegar à prévia local; a tela de login local e o contrato de cadastro foram confirmados visualmente e em testes automatizados.
