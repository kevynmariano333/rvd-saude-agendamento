/**
 * Os avisos de solicitação da portaria no aparelho.
 *
 * O navegador precisa de permissão do usuário e de uma inscrição com a chave
 * pública do servidor. Sem service worker (ou fora do app instalado, em alguns
 * navegadores), nada disso está disponível, e a tela simplesmente não mostra o botão.
 */

export function avisosSaoPossiveis(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** A chave pública vem em base64 (com `-` e `_`); a inscrição quer bytes. */
function chaveParaBytes(chave: string): Uint8Array {
  const preenchida = chave.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(chave.length / 4) * 4, "=");
  const texto = atob(preenchida);
  return Uint8Array.from(texto, caractere => caractere.charCodeAt(0));
}

/** Pede permissão e se inscreve neste aparelho. Devolve a inscrição, ou null se o usuário recusou. */
export async function ativarAvisosNoAparelho(chavePublica: string): Promise<PushSubscriptionJSON | null> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return null;
  const registro = await navigator.serviceWorker.ready;
  const existente = await registro.pushManager.getSubscription();
  const inscricao = existente ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) as BufferSource }));
  return inscricao.toJSON();
}

/** O aparelho já tem inscrição ativa? */
export async function avisosJaAtivos(): Promise<boolean> {
  if (!avisosSaoPossiveis() || Notification.permission !== "granted") return false;
  const registro = await navigator.serviceWorker.ready;
  return Boolean(await registro.pushManager.getSubscription());
}
