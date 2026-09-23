/**
 * Os números que a barra de páginas mostra.
 *
 * Com 150 páginas não dá para listar todas: aparecem a primeira, a última, a
 * atual e as vizinhas, com reticências no que foi pulado. O tipo "vazio" é a
 * reticência — ela ocupa lugar na barra, mas não é página nenhuma.
 */
export function numerosDasPaginas(atual: number, total: number): (number | "vazio")[] {
  if (total <= 7) return Array.from({ length: total }, (_, indice) => indice + 1);
  const perto = [atual - 1, atual, atual + 1].filter(pagina => pagina > 1 && pagina < total);
  const numeros = [1, ...perto, total];
  const saida: (number | "vazio")[] = [];
  numeros.forEach((numero, indice) => {
    if (indice > 0 && numero - numeros[indice - 1] > 1) saida.push("vazio");
    saida.push(numero);
  });
  return saida;
}
