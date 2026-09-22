# Vídeo do fornecedor — como criar o acesso e agendar

Gravação do portal rodando, do cadastro até o comprovante, com narração em
português. Cada passo também aparece escrito na barra de baixo, para o vídeo
servir com o som desligado — no celular, no depósito, numa reunião.

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

## O que a narração diz

O texto está em `docs/narracao-fornecedor.json`, uma frase por passo. É ele que
dita o ritmo da gravação: cada legenda fica na tela pelo menos o tempo da sua
frase, então a tela nunca corre na frente da fala. Mudou a frase, mudou o tempo.

Para trocar a voz ou o texto, edite esse arquivo e grave de novo.

## Como a gravação foi feita

Uma cópia do sistema roda localmente, com banco e armazenamento próprios; o
navegador é dirigido por um roteiro (`playwright`) que digita, clica e escreve
as legendas. A voz é sintetizada offline (`piper`, voz pt-BR), e o áudio entra
no lugar certo pela linha do tempo que a própria gravação anota. Os dados são
fictícios — a nota é uma das de `docs/demonstracao/`.

Dois pontos do vídeo acontecem fora da tela do fornecedor, e são feitos direto
no banco da cópia local para a gravação não sair do ponto de vista dele:
a aprovação do cadastro e a confirmação da data pelo Operador.

O roteiro da gravação está em `scripts/gravar-video-fornecedor.mjs`, com as
instruções de como rodá-lo — é por ele que o vídeo se refaz quando a tela mudar.

## Também em PDF e PowerPoint

O mesmo passo a passo existe como guia para mandar por e-mail, onde o vídeo não
passa como anexo. As telas dele não são quadros do vídeo — são capturas do
sistema rodando, elemento por elemento, para o texto continuar legível impresso:

```
node scripts/guia-fornecedor/capturar-telas.mjs capturas/
node scripts/guia-fornecedor/montar-guia.mjs capturas/ guia.pptx
soffice --headless --convert-to pdf guia.pptx
```

## Por que o áudio não segue o relógio da gravação

O navegador entrega os quadros no ritmo que consegue, e o arquivo sai esticado:
uma legenda marcada aos 83 segundos de gravação aparece aos 90 do vídeo. Colocar
a fala pelos tempos da gravação atrasa a voz cada vez mais até o fim.
`scripts/tempos-das-legendas.mjs` mede, no próprio vídeo, quando a faixa da
legenda muda, e é por esses tempos que a narração entra.
