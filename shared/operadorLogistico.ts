// Para quem o fornecedor está entregando.
//
// Quem agenda no portal nem sempre sabe que a RVD é o operador logístico da
// Amil, e não o hospital: a carga vem de um pedido feito pelo hospital, mas o
// caminhão descarrega aqui. Um endereço errado custa uma viagem perdida — por
// isso o dado aparece antes do envio e vai impresso no comprovante que o
// motorista leva.
//
// Fica num lugar só, e não copiado em cada tela: mudar de endereço um dia não
// pode depender de alguém lembrar de todos os lugares onde ele foi escrito.

import { empresaDoCnpj, nomeDaEmpresa } from "./empresas";
import { apenasDigitos, UNIDADES } from "./recipients";

export const OPERADOR_LOGISTICO = {
  nome: "RVD",
  cnpj: "39.283.469/0001-10",
  enderecoEntrega: "Rua Antônio Mestriner, 194 – Jd. Fátima, Guarulhos - SP",
  cep: "07175-550",
  aviso: "Você está agendando uma entrega para o operador logístico da Amil que atende os Hospitais Santa Helena.",
} as const;

/** Os campos na ordem em que são lidos, para a tela e o PDF não divergirem. */
export const CAMPOS_DO_OPERADOR: { rotulo: string; valor: string }[] = [
  { rotulo: "Operador", valor: OPERADOR_LOGISTICO.nome },
  { rotulo: "CNPJ", valor: OPERADOR_LOGISTICO.cnpj },
  { rotulo: "Endereço de entrega", valor: OPERADOR_LOGISTICO.enderecoEntrega },
  { rotulo: "CEP", valor: OPERADOR_LOGISTICO.cep },
];

/**
 * O aviso de quem está recebendo a carga, escrito para a empresa da nota.
 *
 * O texto único dizia "o operador logístico da Amil que atende os Hospitais
 * Santa Helena", e deixou de ser verdade no dia em que a RVD e a LLT passaram a
 * agendar aqui: o fornecedor da LLT leria que está entregando para a Amil. A
 * carga continua sendo recebida pela RVD, no mesmo endereço — o que muda é de
 * quem ela é.
 *
 * Sem destinatário conhecido (a nota ainda não foi escolhida, ou o CNPJ não é de
 * cliente nenhum) o aviso não afirma de quem é a carga: diz que o XML decide.
 */
export function avisoDaEntrega(cnpjDoDestinatario: string | null | undefined): string {
  const digitos = apenasDigitos(cnpjDoDestinatario);
  const unidade = UNIDADES.find(item => item.cnpj === digitos);
  if (!unidade) {
    return "O operador logístico RVD recebe a carga de mais de um cliente. A nota fiscal diz para qual a entrega vai: confira o destinatário antes de enviar.";
  }
  const empresa = empresaDoCnpj(digitos);
  if (empresa === "amil") return OPERADOR_LOGISTICO.aviso;
  return `Você está agendando uma entrega para a ${nomeDaEmpresa(empresa)}. A carga é recebida pelo operador logístico RVD, no endereço abaixo.`;
}
