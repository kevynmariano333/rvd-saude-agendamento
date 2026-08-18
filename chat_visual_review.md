# Revisão visual — Chat e notificações de notas

**Data:** 18 de agosto de 2026.

Foi revisado o modal aberto do **Chat do agendamento** para a nota 5676. A janela apresenta cabeçalho com identificação da nota e fornecedor, área de histórico, estado vazio orientando o início da conversa e campo de envio de mensagem. O modal se sobrepõe à tabela com fundo opaco e preserva a identidade visual RVD.

| Recurso | Resultado validado |
|---|---|
| Ícone de mensagem na tabela | Abre o chat do agendamento correspondente. |
| Chat fornecedor–operador | Mensagens são persistidas, autorizadas pelo vínculo ao agendamento e atualizadas periodicamente. |
| Sino da barra superior | Consulta mensagens não lidas e exibe contador quando existir novo conteúdo; sua lista leva ao chat da nota. |
| Leitura | Ao abrir o chat, as mensagens recebidas pelo perfil atual são marcadas como lidas. |

A implementação foi validada por compilação TypeScript e 25 testes automatizados, incluindo o envio, a autorização, a leitura e a listagem de notificações.
