/**
 * O que faz duas notas serem a mesma nota.
 *
 * A mesma nota chegar duas vezes é fácil: o fornecedor manda o XML, o pessoal
 * da portaria não acha o agendamento e registra como recebimento avulso, e a
 * partir daí existem dois registros do mesmo documento — dois recebimentos,
 * duas conferências, dois lançamentos no SAP. Descobrir isso depois custa muito
 * mais caro do que recusar o segundo envio na hora.
 *
 * A identidade de uma NF-e é a chave de acesso: quarenta e quatro dígitos que
 * já carregam CNPJ do emitente, número, série e modelo. Quando ela não vem — as
 * notas do acervo antigo não têm —, sobra a dupla que também identifica um
 * documento fiscal: o CNPJ de quem emitiu e o número da nota.
 */

const DIGITOS_DA_CHAVE = 44;
const DIGITOS_DO_CNPJ = 14;

export type ChaveDeDuplicidade =
  | { tipo: "chaveDeAcesso"; chave: string }
  | { tipo: "fornecedorENumero"; cnpj: string; numero: string };

function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * O número da nota sem os zeros da frente.
 *
 * O mesmo documento aparece como "000123" no XML de um fornecedor e "123" no de
 * outro. Comparar como texto puro deixaria os dois entrarem.
 */
export function numeroComparavel(valor: string | null | undefined): string {
  const digitos = soDigitos(valor).replace(/^0+/, "");
  return digitos;
}

/**
 * Por qual critério esta nota deve ser procurada — ou nenhum.
 *
 * Devolver nulo é uma resposta legítima: nota sem chave de acesso, sem CNPJ do
 * emitente e sem número não dá para reconhecer, e inventar um critério frouxo
 * recusaria notas boas. Entre deixar passar uma duplicata e barrar uma nota
 * legítima, barrar a legítima é o erro pior: ela trava a entrada da mercadoria
 * no pátio.
 */
export function chaveDeDuplicidade(nota: {
  accessKey?: string | null;
  supplierCnpj?: string | null;
  invoiceNumber?: string | null;
}): ChaveDeDuplicidade | null {
  const chave = soDigitos(nota.accessKey);
  if (chave.length === DIGITOS_DA_CHAVE) return { tipo: "chaveDeAcesso", chave };

  const cnpj = soDigitos(nota.supplierCnpj);
  const numero = numeroComparavel(nota.invoiceNumber);
  if (cnpj.length === DIGITOS_DO_CNPJ && numero) return { tipo: "fornecedorENumero", cnpj, numero };

  return null;
}
