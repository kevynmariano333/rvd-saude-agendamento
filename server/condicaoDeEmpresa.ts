// O corte por empresa, como condição de consulta.
//
// A pergunta "esta nota é de uma empresa que o usuário atende?" tem duas
// respostas conforme a empresa, e a diferença é de propósito:
//
//   RVD e LLT: só entra a nota cujo destinatário é CNPJ delas. É o corte
//   estrito — na dúvida, fora —, porque o erro aqui é mostrar a nota de um
//   cliente a quem trabalha para outro.
//
//   Amil: entra tudo que NÃO é da RVD nem da LLT, inclusive a nota sem
//   destinatário. O portal nasceu só com a Amil, e o acervo antigo não tem
//   CNPJ reconhecível; um corte "só o que é do Hospital e da Maternidade"
//   faria sumir da mesa dela o que ela sempre viu.
//
// O espelho em JavaScript desta regra é `notaNoEscopo`, em shared/empresas.ts.
// As duas precisam concordar, e o teste de empresas.test.ts confere isso.

import { isNull, like, not, or, type SQL } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { cnpjsDaEmpresa, EMPRESAS, type CodigoDaEmpresa } from "../shared/empresas";

export function condicaoDaEmpresa(empresa: CodigoDaEmpresa | null | undefined): SQL | undefined {
  if (!empresa) return undefined;
  const coluna = appointments.recipientCnpj;
  const casa = (cnpjs: string[]) => or(...cnpjs.map(cnpj => like(coluna, `%${cnpj}%`)));

  if (empresa === "amil") {
    const dasOutras = EMPRESAS.filter(item => item.codigo !== "amil").flatMap(item => cnpjsDaEmpresa(item.codigo));
    const outras = casa(dasOutras);
    // `NOT (coluna LIKE ...)` é nulo quando a coluna é nula, e nulo não passa
    // no WHERE: sem o IS NULL a nota sem destinatário sumiria da Amil.
    return outras ? or(isNull(coluna), not(outras)) : undefined;
  }
  return casa(cnpjsDaEmpresa(empresa));
}
