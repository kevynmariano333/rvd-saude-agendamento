/**
 * O e-mail que avisa o fornecedor da data marcada.
 *
 * Quem envia a nota não fica com o portal aberto esperando: o agendamento é
 * confirmado por outra pessoa, horas ou dias depois, e até aqui o fornecedor só
 * descobria se voltasse para olhar. Uma entrega que chega no dia errado custa
 * uma viagem, uma doca ocupada à toa e uma nota que volta.
 *
 * Por isso a mensagem carrega as três coisas que o motorista precisa e nada
 * mais: o dia, a hora e o endereço. O endereço é o do operador logístico, e não
 * o do hospital que comprou — é o erro mais caro que um fornecedor comete aqui,
 * porque manda o caminhão para o outro lado da cidade.
 */

import { OPERADOR_LOGISTICO } from "../shared/operadorLogistico";
import { unidadePorCnpj } from "../shared/recipients";

/**
 * O aviso de para onde a carga vai, escrito para quem já agendou.
 *
 * O texto do formulário está no gerúndio ("você está agendando") porque lá a
 * pessoa ainda está preenchendo. Aqui a data já está marcada, e o que a frase
 * precisa fazer é impedir que o caminhão vá para o hospital que comprou.
 */
export const LEMBRETE_DO_LOCAL =
  `A entrega é no ${OPERADOR_LOGISTICO.nome}, o operador logístico da Amil que atende os Hospitais Santa Helena — e não no hospital que fez o pedido.`;

export type DadosDoAviso = {
  invoiceNumber: string | null;
  purchaseOrder: string | null;
  scheduledFor: Date;
  recipientCnpj: string | null;
  supplierName: string | null;
  /** Data marcada de novo, e não pela primeira vez: muda o que a mensagem diz. */
  remarcado: boolean;
};

/** O dia e a hora em Brasília, que é onde a doca abre. */
export function diaEHora(quando: Date): { dia: string; hora: string } {
  const opcoes = { timeZone: "America/Sao_Paulo" } as const;
  return {
    dia: new Intl.DateTimeFormat("pt-BR", { ...opcoes, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(quando),
    hora: new Intl.DateTimeFormat("pt-BR", { ...opcoes, hour: "2-digit", minute: "2-digit" }).format(quando),
  };
}

/** Para quem a carga é, escrito como o fornecedor entende. */
export function destinoDaCarga(recipientCnpj: string | null): string | null {
  const unidade = unidadePorCnpj(recipientCnpj);
  return unidade ? `${unidade.sigla} — ${unidade.nome}` : null;
}

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function conteudoDoAgendamento(dados: DadosDoAviso): { subject: string; html: string; text: string } {
  const { dia, hora } = diaEHora(dados.scheduledFor);
  const nota = dados.invoiceNumber ? `NF ${dados.invoiceNumber}` : "sua nota";
  const destino = destinoDaCarga(dados.recipientCnpj);
  const titulo = dados.remarcado ? "Entrega remarcada" : "Entrega agendada";

  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: "Dia", valor: dia },
    { rotulo: "Horário", valor: hora },
    { rotulo: "Local da entrega", valor: `${OPERADOR_LOGISTICO.nome} — ${OPERADOR_LOGISTICO.enderecoEntrega} (CEP ${OPERADOR_LOGISTICO.cep})` },
    { rotulo: "Nota fiscal", valor: dados.invoiceNumber || "não informada" },
  ];
  if (dados.purchaseOrder) linhas.push({ rotulo: "Pedido de compra", valor: dados.purchaseOrder });
  if (destino) linhas.push({ rotulo: "Destinatário da carga", valor: destino });

  const abertura = dados.remarcado
    ? `A entrega da ${nota} foi remarcada. Anote a nova data:`
    : `A entrega da ${nota} está agendada. Anote a data:`;

  const text = [
    `${titulo} · RVD Saúde`,
    "",
    abertura,
    "",
    ...linhas.map(linha => `${linha.rotulo}: ${linha.valor}`),
    "",
    LEMBRETE_DO_LOCAL,
    "Chegue no horário combinado e leve a nota impressa. Para remarcar, fale pelo portal.",
    "",
    "Esta mensagem é automática — não responda a este e-mail.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f6f4f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#782078;padding:24px 28px">
          <p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold">RVD Saúde</p>
          <p style="margin:6px 0 0;color:#c9e1ee;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">Sistema de Agendamento</p>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0;color:#782078;font-size:22px">${titulo}</h1>
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
          <p style="margin:24px 0 0;color:#7a6f7e;font-size:13px;line-height:1.6">${escapar(LEMBRETE_DO_LOCAL)}</p>
          <p style="margin:12px 0 0;color:#3f3244;font-size:14px;line-height:1.6">Chegue no horário combinado e leve a nota impressa. Para remarcar, fale pelo portal.</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf7fa;color:#9a8f9e;font-size:12px">Esta mensagem é automática — não responda a este e-mail.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const assunto = `${titulo}: ${dia}, ${hora} · ${nota}`;
  return { subject: assunto, html, text };
}
