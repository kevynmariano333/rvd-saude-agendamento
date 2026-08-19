# Referência visual do Dashboard

## Cartões de indicadores

Os cartões seguem uma composição branca, com borda cinza muito suave, cantos amplamente arredondados e bastante respiro. Cada cartão usa um rótulo em caixa alta, métrica em destaque e ícone pequeno no canto superior direito.

Os três indicadores confirmados são: **Pendentes**, **Agendadas** e **Recebidas (30d)**. Para a RVD Saúde, o primeiro cartão será renomeado para **Pendentes de Agendamento**, mantendo a mesma hierarquia visual e usando dados reais do período selecionado.

## Gráfico diário

O bloco principal é um cartão horizontal chamado **Recebimentos**, com o título **Notas recebidas por dia**. O gráfico é de barras verdes, com valores sobre cada barra, grade discreta e datas no eixo inferior. A implementação usará o mês e ano selecionados para agrupar as notas pela data real de recebimento.

## Tempo de espera

O cartão de espera usa o rótulo **Tempo médio de espera**, o título **Pendentes sem agendamento** e uma métrica central de duração. Para evitar números ilustrativos, o Dashboard calculará a média real entre a criação da nota e a confirmação do agendamento, exibindo também a quantidade de notas pendentes usada no cálculo.

## Validação

O perfil Operador foi selecionado na tela de acesso para validar os novos indicadores na área autenticada. A validação utilizará o acesso de demonstração já disponibilizado pelo portal, sem criar dados adicionais.

O login de demonstração foi concluído no perfil de Operador Administrador. A navegação superior confirmou o acesso aos módulos Dashboard, Agendamentos, Calendário, Relatórios e Administrar notas.

O Dashboard foi revisado no perfil autenticado. Os filtros de mês e ano, os três cartões de indicadores, o gráfico de recebimentos, o ranking de fornecedores e o cartão de espera foram exibidos corretamente; no período sem registros, os blocos mostram estados vazios explicativos sem dados simulados.

A central de agendamentos exibiu uma nota XML existente disponível para abrir o Detalhamento da Nota. Esse registro é anterior às novas colunas financeiras, portanto serve para validar o layout ampliado e não apresenta valores retroativos; novos XMLs passam a persistir os valores extraídos.

O Detalhamento da Nota foi revisado depois da ampliação. A janela agora ocupa largura ampla e apresenta uma faixa de resumo financeiro, além de tabela de itens com quantidade, valor unitário e valor total. Para XMLs anteriores, o sistema informa que os valores não estavam disponíveis; novos XMLs preenchem essas informações automaticamente.

O Histórico de datas foi validado visualmente com três registros reais. A nova linha do tempo apresenta cada evento em cartão próprio, com status, perfil, responsável, data, hora, tipo de registro e observação, sem a compressão da tabela anterior.

A NF 5676 teve o XML armazenado relido e passou a mostrar o valor total de R$ 39.778,00, com 25 unidades do item ARTICAINE 1:100.000 a R$ 1.591,12 cada. A verificação também confirmou que não restaram XMLs armazenados sem total financeiro no banco atual.
