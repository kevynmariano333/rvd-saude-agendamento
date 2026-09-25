/**
 * Como o sistema se chama, num lugar só.
 *
 * O nome aparece no cabeçalho do portal, na tela de entrada, no e-mail que o
 * fornecedor recebe e no comprovante que o motorista leva. Espalhado por esses
 * quatro lugares, trocar o nome vira caça ao texto — e sempre sobra um canto
 * com o nome antigo, que é onde alguém repara.
 *
 * `empresa` é outra coisa: é quem assina, e não muda quando o sistema é
 * rebatizado.
 */
export const MARCA = {
  /** O nome do sistema, como as pessoas falam dele. */
  nome: "RVDlog+",
  /** O que ele é, embaixo do nome. */
  descricao: "Sistema de Agendamento",
  /** A empresa por trás. */
  empresa: "RVD Saúde",
} as const;

/** Nome e descrição juntos, para título de aba e assunto de e-mail. */
export const MARCA_COMPLETA = `${MARCA.nome} · ${MARCA.descricao}`;
