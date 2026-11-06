import webpush from "web-push";
import { listAttendances, listarInscricoesDaOperacao, removerInscricaoDePush } from "./db";

/** Quem decide a liberação no portão recebe o aviso. */
const PAPEIS_DA_OPERACAO = ["operacao", "operator", "admin"] as const;

export type ConfiguracaoDoAviso = { publicKey: string; privateKey: string; subject: string };

/**
 * As chaves do aviso vêm do ambiente. Sem elas, o aviso fica desligado e o
 * portal segue igual. A chave pública não é segredo; a privada fica só no Railway.
 */
export function configuracaoDoAviso(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDoAviso | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = env.VAPID_SUBJECT?.trim() || env.APP_URL?.trim() || "https://agendamentorvd.up.railway.app";
  return { publicKey, privateKey, subject };
}

/** O texto que aparece no aviso. Não leva nome nem documento do motorista. */
export function montarPayloadDaPortaria(input: { placa: string; fornecedor: string; contagem: number }) {
  return {
    titulo: "Solicitação da portaria",
    corpo: `Caminhão ${input.placa} (${input.fornecedor}) aguardando liberação no portão.`,
    contagem: input.contagem,
    url: "/operacao",
  };
}

/**
 * Avisa a Operação de uma chegada nova no portão.
 *
 * Chamado depois que a chegada foi gravada, e sem esperar: uma falha de envio
 * não pode fazer a portaria perder o registro.
 */
export async function avisarSolicitacaoDaPortaria(input: { placa: string; fornecedor: string }) {
  const config = configuracaoDoAviso();
  if (!config) return;
  const inscricoes = await listarInscricoesDaOperacao(PAPEIS_DA_OPERACAO);
  if (!inscricoes.length) return;

  // A contagem é a mesma das solicitações pendentes: o número no ícone bate com a tela.
  const aguardando = await listAttendances({ status: "aguardando" });
  const payload = JSON.stringify(montarPayloadDaPortaria({ ...input, contagem: aguardando.length }));
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  await Promise.all(
    inscricoes.map(async inscricao => {
      try {
        await webpush.sendNotification({ endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } }, payload, { TTL: 3600 });
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        // 404 e 410: o aparelho desinstalou o app ou revogou o aviso. Não adianta tentar de novo.
        if (status === 404 || status === 410) await removerInscricaoDePush(inscricao.endpoint);
        else console.warn("[Push] falha ao enviar o aviso:", status ?? "erro desconhecido");
      }
    }),
  );
}
