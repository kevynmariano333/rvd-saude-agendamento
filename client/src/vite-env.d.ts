
/** O commit que gerou esta build; entra no rodapé. Definido no vite.config.ts. */
declare const __VERSAO_DO_APP__: string;

/**
 * O codificador de código de barras, usado direto do seu módulo interno.
 *
 * A jsbarcode foi feita para desenhar em canvas ou SVG dentro de uma página; o
 * DANFE precisa das barras dentro de um PDF. Esta é a parte dela que responde
 * "quais barras", sem tocar em DOM nenhum — e é a única que o projeto usa.
 */
declare module "jsbarcode/bin/barcodes/CODE128/index.js" {
  class CODE128C {
    constructor(dados: string, opcoes: Record<string, unknown>);
    valid(): boolean;
    encode(): { data: string; text: string };
  }
  export { CODE128C };
}
