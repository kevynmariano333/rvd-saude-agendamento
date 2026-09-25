export function isUnexpectedHtmlApiResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return response.ok && contentType.includes("text/html");
}

/**
 * O que dizer quando a resposta não é da API.
 *
 * Entre o navegador e o sistema existe o proxy da hospedagem. Quando o
 * servidor está reiniciando — todo deploy — ou demora demais para responder,
 * quem responde é o proxy, com um texto solto: "upstream error". A tela tentava
 * ler isso como JSON e mostrava "Unexpected token 'u'", que não diz nada a
 * ninguém e some com um F5.
 *
 * Devolve `null` quando a resposta é JSON de verdade, que é o caso normal.
 */
export function mensagemDeRespostaNaoJson(response: Response): string | null {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) return null;
  if (response.status === 0 || response.status >= 500) {
    return "O servidor não respondeu. Ele pode estar reiniciando depois de uma atualização, ou a ação demorou mais do que o limite. Espere alguns instantes e tente de novo.";
  }
  return `O servidor respondeu em um formato inesperado (HTTP ${response.status}). Atualize a página e tente de novo.`;
}
