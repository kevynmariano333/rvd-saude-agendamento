# Notas de demonstração

Quatro XMLs de nota fiscal **fictícios**, para popular a tela antes de gravar uma
apresentação ou treinar alguém no portal. Os fornecedores não existem; o CNPJ do
destinatário é o da RVD Saúde, para as notas caírem no lugar certo.

| Arquivo | NF | Fornecedor | Pedido | Valor | Volumes |
|---|---|---|---|---|---|
| `NF-10071-cirurgica-ponta-verde.xml` | 10071 | Cirúrgica Ponta Verde | 4504748409 | R$ 12.480,00 | 8 |
| `NF-8842-vida-plena.xml` | 8842 | Distribuidora Vida Plena | 4504751122 | R$ 3.215,50 | 3 |
| `NF-20455-norte-sul.xml` | 20455 | Norte Sul Produtos Hospitalares | 4504760077 | R$ 7.940,00 | 12 |
| `NF-1503-tecnolab.xml` | 1503 | TecnoLab Equipamentos | 4504763310 | R$ 45.900,00 | 2 |

**Enviadas no sistema de produção, elas entram no banco de verdade.** Os nomes
dos fornecedores são inventados de propósito: é por eles que se acha e se apaga
essas notas depois, em *Administrar notas*.

A data de emissão de cada XML vira a data que a nota aparece na lista. Se você
for usar meses depois, edite o campo `<dhEmi>` para uma data recente — senão as
notas somem nos atalhos de "Hoje" e "Amanhã".
