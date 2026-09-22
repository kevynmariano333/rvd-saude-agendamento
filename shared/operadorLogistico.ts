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
