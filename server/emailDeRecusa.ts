/**
 * O e-mail que avisa o fornecedor de que a nota foi recusada, e por quê.
 *
 * A recusa é a única decisão do portal que custa dinheiro do outro lado: o
 * caminhão já saiu, a carga volta, e alguém precisa refazer o agendamento. Até
 * aqui ela acontecia em silêncio — o fornecedor só descobria se voltasse ao
 * portal para olhar, e muitos descobriam pelo motorista ligando da estrada.
 *
 * O motivo vai junto, e é o ponto todo da mensagem. "Sua nota foi recusada",
 * sozinho, obriga o fornecedor a ligar para perguntar o que houve — e quem
 * atende o telefone é a mesma doca que recusou. Com o motivo escrito, a maior
 * parte dos casos se resolve sem telefonema: documento errado se corrige,
 * divergência de pedido se confere, carga avariada vira coleta.
 */

import { OPERADOR_LOGISTICO } from "../shared/operadorLogistico";
import { rotuloDaRecusa } from "../shared/motivosDeRecusa";
import { unidadePorCnpj } from "../shared/recipients";
import { MARCA } from "../shared/marca";

export type DadosDaRecusa = {
  invoiceNumber: string | null;
  purchaseOrder: string | null;
  /** A data que estava marcada, quando havia uma. */
  scheduledFor: Date | null;
  recipientCnpj: string | null;
  motivoCodigo: string | null;
  /** O que o operador escreveu. É o que o fornecedor já vê no portal. */
  descricao: string | null;
  recusadaEm: Date;
};

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emBrasilia(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

/**
 * O que fazer agora, dito em uma linha.
 *
 * Depende do motivo: mandar "corrija e reagende" para quem cancelou a própria
 * entrega é ruído, e mandar o mesmo texto genérico para quem teve a carga
 * avariada não ajuda ninguém a resolver.
 */
export function oQueFazerAgora(motivoCodigo: string | null): string {
  switch (motivoCodigo) {
    case "NAO_COMPARECEU":
    case "FORA_DO_HORARIO":
    case "SEM_AGENDAMENTO":
      return "Para entregar, marque uma nova data pelo portal antes de despachar o caminhão.";
    case "DOCUMENTO_IRREGULAR":
      return "Corrija o documento fiscal e envie a nota de novo pelo portal, com o XML.";
    case "DIVERGENCIA_PEDIDO":
      return "Confira a nota contra o pedido de compra. Resolvida a diferença, reenvie pelo portal.";
    case "CARGA_AVARIADA":
      return "A carga fica à disposição para coleta. Combine a devolução e, se for reenviar, marque nova data pelo portal.";
    case "DUPLICIDADE":
      return "Esta nota já constava no portal. Não é preciso reenviar — confira o agendamento que já existe.";
    case "CANCELADA_FORNECEDOR":
      return "O cancelamento partiu de vocês. Se a entrega voltar a valer, marque uma nova data pelo portal.";
    default:
      return "Resolvido o que motivou a recusa, marque uma nova data pelo portal.";
  }
}

/**
 * A descrição sem o rótulo que ela já carrega.
 *
 * O que fica gravado na nota é "Documento fiscal irregular — A nota veio sem o
 * XML": rótulo e descrição numa linha só, porque a coluna é de texto e o
 * relatório lê a frase. Aqui o rótulo já tem a linha dele, e repeti-lo logo
 * abaixo faz a mensagem parecer gaguejar.
 */
export function soADescricao(motivoCodigo: string | null, texto: string | null): string {
  const detalhe = (texto ?? "").trim();
  const rotulo = rotuloDaRecusa(motivoCodigo);
  if (!detalhe.toLocaleLowerCase().startsWith(rotulo.toLocaleLowerCase())) return detalhe;
  return detalhe.slice(rotulo.length).replace(/^\s*[—–-]\s*/, "").replace(/^\s*:\s*/, "").trim();
}

export function conteudoDaRecusa(dados: DadosDaRecusa): { subject: string; html: string; text: string } {
  const nota = dados.invoiceNumber ? `NF ${dados.invoiceNumber}` : "sua nota";
  const motivo = rotuloDaRecusa(dados.motivoCodigo);
  const detalhe = soADescricao(dados.motivoCodigo, dados.descricao);
  const unidade = unidadePorCnpj(dados.recipientCnpj);
  const proximoPasso = oQueFazerAgora(dados.motivoCodigo);

  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: "Nota fiscal", valor: dados.invoiceNumber || "não informada" },
    { rotulo: "Motivo da recusa", valor: motivo },
  ];
  // A descrição só entra quando acrescenta alguma coisa ao rótulo.
  if (detalhe) linhas.push({ rotulo: "O que houve", valor: detalhe });
  if (dados.purchaseOrder) linhas.push({ rotulo: "Pedido de compra", valor: dados.purchaseOrder });
  if (dados.scheduledFor) linhas.push({ rotulo: "Data que estava marcada", valor: emBrasilia(dados.scheduledFor) });
  if (unidade) linhas.push({ rotulo: "Destinatário da carga", valor: `${unidade.sigla} — ${unidade.nome}` });
  linhas.push({ rotulo: "Recusada em", valor: emBrasilia(dados.recusadaEm) });

  const abertura = `A entrega da ${nota} foi recusada no recebimento do ${OPERADOR_LOGISTICO.nome}.`;

  const text = [
    `Entrega recusada · ${MARCA.nome}`,
    "",
    abertura,
    "",
    ...linhas.map(linha => `${linha.rotulo}: ${linha.valor}`),
    "",
    proximoPasso,
    "",
    "Esta mensagem é automática — não responda a este e-mail. Para falar sobre esta nota, use a conversa dela no portal.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f6f4f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#782078;padding:24px 28px">
          <p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold">${MARCA.nome}</p>
          <p style="margin:6px 0 0;color:#c9e1ee;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">${MARCA.descricao}</p>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0;color:#782078;font-size:22px">Entrega recusada</h1>
          <p style="margin:16px 0 0;color:#3f3244;font-size:15px;line-height:1.6">${escapar(abertura)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-collapse:collapse">
            ${linhas
              .map(
                linha => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px;width:40%;vertical-align:top">${escapar(linha.rotulo)}</td>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#3f3244;font-size:15px;font-weight:bold">${escapar(linha.valor)}</td>
            </tr>`,
              )
              .join("\n            ")}
          </table>
          <p style="margin:24px 0 0;color:#3f3244;font-size:14px;line-height:1.6">${escapar(proximoPasso)}</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf7fa;color:#9a8f9e;font-size:12px">Esta mensagem é automática — não responda a este e-mail. Para falar sobre esta nota, use a conversa dela no portal.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: `Entrega recusada: ${motivo} · ${nota}`, html, text };
}
