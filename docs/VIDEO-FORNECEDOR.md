# Vídeo do fornecedor — como criar o acesso e agendar

Gravação do portal rodando, do cadastro até o comprovante. Sem áudio: cada
passo aparece escrito na barra de baixo, para o vídeo poder ser assistido em
qualquer lugar e para você poder narrar por cima se quiser.

## O que o vídeo mostra

| Passo | Tela | O que acontece |
| --- | --- | --- |
| 1 | Início | Escolher o acesso **Fornecedor** |
| 2 | Acesso | Clicar em **Novo cadastro de fornecedor** |
| 3 | Cadastro | Razão social e CNPJ da empresa |
| 4 | Cadastro | E-mail e senha (mínimo de 6 caracteres) |
| 5 | Cadastro | **Criar conta de fornecedor** |
| — | Aviso | O cadastro fica **em análise**: o Operador libera o acesso em *Acessos* |
| 6 | Acesso | Entrar com e-mail e senha já liberados |
| — | Lembrete | O endereço do operador logístico, antes de qualquer envio |
| 7 | Agendamento | Selecionar o **XML** da nota fiscal |
| 8 | Agendamento | **Pedido de compra** — obrigatório |
| 9 | Agendamento | Sugestão de data, hora e observação (opcional) |
| 10 | Agendamento | **Enviar agendamento** |
| 11 | Acompanhamento | O Operador confirma e o status vira **Agendado** |
| 12 | Acompanhamento | **Comprovante PDF** para o motorista levar |

## Narração, se você quiser falar por cima

1. "Para agendar uma entrega na RVD Saúde, abra o portal e escolha o acesso de
   fornecedor."
2. "Se é a sua primeira vez, clique em novo cadastro."
3. "Informe a razão social e o CNPJ da sua empresa."
4. "Depois o e-mail que vai receber os avisos e uma senha de pelo menos seis
   caracteres."
5. "Crie a conta. O cadastro fica em análise: a equipe da RVD libera o acesso."
6. "Com o acesso liberado, entre com o seu e-mail e a sua senha."
7. "Antes de mais nada, repare no lembrete: a entrega é feita no operador
   logístico, no endereço que aparece aí — não no hospital."
8. "Selecione o XML da nota fiscal. O sistema lê o número, o valor e os volumes
   sozinho."
9. "Informe o número do pedido de compra. Esse campo é obrigatório: é por ele
   que a RVD confere o recebimento."
10. "Se quiser, sugira uma data e um horário. O Operador avalia."
11. "Envie. A nota entra como em análise."
12. "Quando o Operador confirma a data, o status muda para agendado e o botão
    do comprovante aparece. Baixe o PDF e mande junto com o motorista: ele já
    traz o endereço de entrega e o QR de validação."
13. "Qualquer dúvida sobre uma nota, use o botão conversar do próprio
    agendamento."

## Como a gravação foi feita

Uma cópia do sistema roda localmente, com banco e armazenamento próprios; o
navegador é dirigido por um roteiro (`playwright`) que digita, clica e escreve
as legendas. Os dados são fictícios — a nota é uma das de `docs/demonstracao/`.

Dois pontos do vídeo acontecem fora da tela do fornecedor, e são feitos direto
no banco da cópia local para a gravação não sair do ponto de vista dele:
a aprovação do cadastro e a confirmação da data pelo Operador.

O roteiro da gravação está em `scripts/gravar-video-fornecedor.mjs`, com as
instruções de como rodá-lo — é por ele que o vídeo se refaz quando a tela mudar.
